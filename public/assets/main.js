"use strict";

window.onload = function()
{
    var startTime = Date.now();
    var bootStartTime = null;
    var timer = null;
    var phase = "download";
    var downloadProgress = {};
    var totalFiles = 4;
    
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    
    function updateStatus() {
        var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        var status = document.getElementById("status");
        
        if (phase === "download") {
            var loaded = 0, total = 0, count = 0;
            for (var key in downloadProgress) {
                loaded += downloadProgress[key].loaded;
                total += downloadProgress[key].total;
                count++;
            }
            if (total > 0) {
                var pct = Math.round((loaded / total) * 100);
                status.textContent = "Downloading... " + pct + "% (" + formatBytes(loaded) + ")";
            } else {
                status.textContent = "Downloading... " + elapsed + "s";
            }
        } else {
            var bootElapsed = ((Date.now() - bootStartTime) / 1000).toFixed(1);
            status.textContent = "Booting... " + bootElapsed + "s";
        }
    }
    
    timer = setInterval(updateStatus, 100);
    updateStatus();

    var emulator = new V86({
        wasm_path: "lib/v86.wasm",
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,

        bios: {
            url: "bios/seabios.bin",
        },
        vga_bios: {
            url: "bios/vgabios.bin",
        },
        bzimage: {
            url: "images/bzImage",
        },
        initrd: {
            url: "assets/filesystem.img",
        },
        cmdline: [
          "root=/dev/ram0",
          "rw",
          "init=/init",
          "console=tty0",
          "console=ttyS0",
          "quiet"
        ].join(" "),
        autostart: true,
        disable_keyboard: true,
        disable_mouse: true,
    });

    emulator.add_listener("download-progress", function(e) {
        downloadProgress[e.file_name] = { loaded: e.loaded, total: e.total };
        updateStatus();
    });

    emulator.add_listener("emulator-started", function() {
        phase = "boot";
        bootStartTime = Date.now();
        updateStatus();
    });

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
        var lines = outputBuffer.split('\n');
        lines.shift();
        var filtered = lines.filter(function(line) {
            if (line.trim() === '/ #') return false;
            return true;
        });
        var result = filtered.join('\n').trim();
        document.getElementById("result").innerHTML = ansiToHtml(result);
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
            console.log("Now ready");
            clearInterval(timer);
            var totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
            document.getElementById("status").textContent = "Ready in " + totalTime + "s";
            document.getElementById("run").disabled = false;
            var bootTip = document.getElementById("boot-tip");
            if(bootTip) bootTip.classList.add("hidden");
            do_output = false;
            updateOutput();
        }
    });

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
