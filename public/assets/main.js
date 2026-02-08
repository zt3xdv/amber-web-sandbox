"use strict";

window.onload = function()
{
    var status = document.getElementById("status");
    status.textContent = "Downloading...";

    var emulator = new V86({
        wasm_path: "dist/v86.wasm",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        autostart: false,
        disable_keyboard: true,
        disable_mouse: true,
    });

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "dist/initial_state.bin", true);
    xhr.responseType = "arraybuffer";
    xhr.onprogress = function(e) {
        if (e.lengthComputable) {
            var pct = Math.round((e.loaded / e.total) * 100);
            status.textContent = "Downloading... " + pct + "%";
        }
    };
    xhr.onload = function() {
        if (xhr.status !== 200 && xhr.status !== 0) {
            status.textContent = "Error: No state file";
            return;
        }
        status.textContent = "Restoring...";
        new Response(
            new Response(xhr.response).body.pipeThrough(new DecompressionStream("gzip"))
        ).arrayBuffer().then(function(state) {
            emulator.restore_state(state);
            emulator.run();
            onReady();
        }).catch(function(err) {
            status.textContent = "Error: " + err.message;
        });
    };
    xhr.onerror = function() {
        status.textContent = "Error: Download failed";
    };
    xhr.send();

    var data = "";
    var do_output = false;
    var outputBuffer = "";
    var firstLineSkipped = false;

    function ansiToHtml(text) {
        var ansiMap = {
            '30': 'ansi-black', '31': 'ansi-red', '32': 'ansi-green', '33': 'ansi-yellow',
            '34': 'ansi-blue', '35': 'ansi-magenta', '36': 'ansi-cyan', '37': 'ansi-white',
            '40': 'ansi-bg-black', '41': 'ansi-bg-red', '42': 'ansi-bg-green', '43': 'ansi-bg-yellow',
            '44': 'ansi-bg-blue', '45': 'ansi-bg-magenta', '46': 'ansi-bg-cyan', '47': 'ansi-bg-white',
            '1': 'ansi-bold', '2': 'ansi-dim', '4': 'ansi-underline'
        };
        
        var html = text.replace(/\x1b\[([0-9;]+)m/g, function(match, codes) {
            if (codes === '0') return '</span>';
            var classes = codes.split(';').map(function(c) { return ansiMap[c] || ''; }).filter(Boolean);
            return classes.length ? '<span class="' + classes.join(' ') + '">' : '';
        });
        
        return html.replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/&lt;span class="/g, '<span class="')
            .replace(/"&gt;/g, '">')
            .replace(/&lt;\/span&gt;/g, '</span>');
    }

    function updateOutput() {
        var text = outputBuffer;
        var cmdEnd = text.indexOf("amber.sh\n");
        if (cmdEnd !== -1) {
            text = text.substring(cmdEnd + 9);
        }
        text = text.replace(/\n\/\s*#\s*$/, '').trim();
        document.getElementById("result").innerHTML = ansiToHtml(text);
    }

    emulator.add_listener("serial0-output-byte", function(byte)
    {
        var char = String.fromCharCode(byte);
        if(char !== "\r")
        {
            data += char;
        }

        if(do_output)
        {
            outputBuffer += char;
            updateOutput();
        }

        if(data.endsWith("/ # "))
        {
            onReady();
            do_output = false;
            updateOutput();
        }
    });

    function onReady() {
        document.getElementById("status").textContent = "Ready";
        document.getElementById("run").disabled = false;
        var bootTip = document.getElementById("boot-tip");
        if(bootTip) bootTip.classList.add("hidden");
    }

    window.saveState = function() {
        emulator.save_state(function(err, state) {
            if (err) { console.error(err); return; }
            var blob = new Blob([state]);
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'initial_state.bin';
            a.click();
            console.log('State saved. Move to public/assets/initial_state.bin');
        });
    };

    document.getElementById("source").onkeydown = function(e)
    {
        if(e.which == 13 && e.ctrlKey)
        {
            document.getElementById("run").onclick();
        }
    };

    document.getElementById("run").onclick = function()
    {
        var code = document.getElementById("source").value;

        emulator.serial0_send("echo " + bashEscape(code) + " > /amber.ab && amber build /amber.ab && bash /amber.sh\n");

        document.getElementById("result").innerHTML = "";
        outputBuffer = "";
        document.getElementById("status").textContent = "Running...";
        this.disabled = true;

        do_output = true;
    };
};

// https://gist.github.com/creationix/2502704
// Implement bash string escaping.
function bashEscape(arg)
{
    arg = arg.replace(/\t+/g, "");
    return "'" + arg.replace(/'+/g, function (val) {
        return "'" + val.replace(/'/g, "\\'") + "'";
    }) + "'";
}
