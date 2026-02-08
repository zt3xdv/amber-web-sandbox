#!/usr/bin/env node

import { V86 } from './src/main.js';
import fs from 'fs';

import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_DIR = path.join(__dirname, 'system');
const PERMISSIONS_FILE = path.join(__dirname, 'permissions.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIST_DIR = path.join(PUBLIC_DIR, 'dist');
const FILESYSTEM_FILE = path.join(__dirname, '.amber.img');
const STATE_FILE = path.join(DIST_DIR, 'initial_state.bin');

let inoCounter = 721956;

// === CPIO/Filesystem Functions ===

function loadPermissions() {
    return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
}

function parseMode(modeStr, type) {
    const perm = parseInt(modeStr, 8);
    const typeMap = {
        'directory': 0o040000,
        'file': 0o100000,
        'symlink': 0o120000
    };
    return (typeMap[type] || 0o100000) | perm;
}

function hex8(n) {
    return (n >>> 0).toString(16).padStart(8, '0');
}

function cpioHeader(name, mode, uid, gid, nlink, mtime, filesize) {
    const ino = inoCounter++;
    const namesize = Buffer.byteLength(name, 'utf8') + 1;

    return Buffer.from(
        '070701' +
        hex8(ino) +
        hex8(mode) +
        hex8(uid) +
        hex8(gid) +
        hex8(nlink) +
        hex8(mtime) +
        hex8(filesize) +
        hex8(0) +
        hex8(0) +
        hex8(0) +
        hex8(0) +
        hex8(namesize) +
        hex8(0),
        'ascii'
    );
}

function align4(size) {
    return (4 - (size % 4)) % 4;
}

function createCpioEntry(name, mode, uid, gid, nlink, mtime, data) {
    const header = cpioHeader(name, mode, uid, gid, nlink, mtime, data.length);
    const nameBytes = Buffer.from(name + '\0', 'utf8');
    const headerPadding = Buffer.alloc(align4(110 + nameBytes.length));
    const dataPadding = Buffer.alloc(align4(data.length));
    
    return Buffer.concat([header, nameBytes, headerPadding, data, dataPadding]);
}

function findFiles(dir, base, perms, symlinks) {
    const entries = [];
    const items = fs.readdirSync(dir).sort();
    
    for (const name of items) {
        const fullPath = path.join(dir, name);
        const cpioPath = base + '/' + name;
        const permKey = cpioPath.replace(/^\./, '');
        const stat = fs.statSync(fullPath);
        const mtime = Math.floor(stat.mtimeMs / 1000);
        
        if (stat.isDirectory()) {
            const perm = perms[permKey] || { mode: '0755', uid: 0, gid: 0 };
            entries.push({
                path: cpioPath,
                mode: parseMode(perm.mode, 'directory'),
                uid: perm.uid,
                gid: perm.gid,
                nlink: 2,
                mtime,
                data: Buffer.alloc(0)
            });
            entries.push(...findFiles(fullPath, cpioPath, perms, symlinks));
        } else {
            const perm = perms[permKey] || { mode: '0644', uid: 0, gid: 0 };
            entries.push({
                path: cpioPath,
                mode: parseMode(perm.mode, 'file'),
                uid: perm.uid,
                gid: perm.gid,
                nlink: 1,
                mtime,
                data: fs.readFileSync(fullPath)
            });
        }
    }
    
    return entries;
}

function buildFilesystem() {
    console.log('=== Building Filesystem ===\n');
    
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }
    
    // Copy v86 libraries
    const LIB_DIR = path.join(__dirname, 'lib');
    fs.copyFileSync(path.join(LIB_DIR, 'libv86.js'), path.join(DIST_DIR, 'libv86.js'));
    fs.copyFileSync(path.join(LIB_DIR, 'v86.wasm'), path.join(DIST_DIR, 'v86.wasm'));
    console.log('Copied: libv86.js, v86.wasm\n');

    const permsData = loadPermissions();
    const perms = permsData.files || {};
    const symlinks = permsData.symlinks || {};
    const buffers = [];
    
    const rootPerm = perms['/'] || { mode: '0755', uid: 0, gid: 0 };
    const rootStat = fs.statSync(SYSTEM_DIR);
    buffers.push(createCpioEntry(
        '.',
        parseMode(rootPerm.mode, 'directory'),
        rootPerm.uid,
        rootPerm.gid,
        2,
        Math.floor(rootStat.mtimeMs / 1000),
        Buffer.alloc(0)
    ));
    
    const entries = findFiles(SYSTEM_DIR, '.', perms, symlinks);
    for (const e of entries) {
        buffers.push(createCpioEntry(e.path, e.mode, e.uid, e.gid, e.nlink, e.mtime, e.data));
    }
    
    for (const [linkPath, target] of Object.entries(symlinks)) {
        buffers.push(createCpioEntry(
            '.' + linkPath,
            parseMode('0777', 'symlink'),
            0, 0, 1, 0,
            Buffer.from(target, 'utf8')
        ));
    }
    
    buffers.push(createCpioEntry('TRAILER!!!', 0, 0, 0, 1, 0, Buffer.alloc(0)));
    
    const cpio = Buffer.concat(buffers);
    const gzipped = zlib.gzipSync(cpio, { level: 9 });
    
    fs.writeFileSync(FILESYSTEM_FILE, gzipped);
    console.log(`Filesystem: ${FILESYSTEM_FILE} (${gzipped.length} bytes)\n`);
}

// === State Generation ===

function generateState() {
    console.log('=== Generating VM State ===\n');
    
    const wasmBuffer = fs.readFileSync(path.join(__dirname, 'lib', 'v86.wasm'));

    const emulator = new V86({
        wasm_fn: async (imports) => {
            const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
            return instance.exports;
        },
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        bios: { url: path.join(PUBLIC_DIR, 'bios', 'seabios.bin') },
        vga_bios: { url: path.join(PUBLIC_DIR, 'bios', 'vgabios.bin') },
        bzimage: { url: path.join(__dirname, 'images', 'bzImage') },
        initrd: { url: FILESYSTEM_FILE },
        cmdline: "root=/dev/ram0 rw init=/init console=ttyS0 quiet",
        autostart: true,
    });

    let data = '';
    const startTime = Date.now();

    console.log('Booting VM...\n');

    emulator.add_listener("serial0-output-byte", function(byte) {
        const char = String.fromCharCode(byte);
        if (char !== '\r') {
            data += char;
            process.stdout.write(char);
        }

        if (data.endsWith('/ # ')) {
            const bootTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n\n=== VM Ready in ${bootTime}s ===`);
            console.log('Saving state...');

            emulator.save_state().then(state => {
                const raw = Buffer.from(state);
                const compressed = zlib.gzipSync(raw, { level: 9 });
                fs.writeFileSync(STATE_FILE, compressed);
                const rawMB = (raw.length / 1024 / 1024).toFixed(2);
                const compMB = (compressed.length / 1024 / 1024).toFixed(2);
                console.log(`State saved: ${STATE_FILE} (${rawMB} MB -> ${compMB} MB)`);
                
                fs.unlinkSync(FILESYSTEM_FILE);
                emulator.stop();
                process.exit(0);
            }).catch(err => {
                console.error('Error:', err);
                process.exit(1);
            });
        }
    });
}

// === Main ===

buildFilesystem();
generateState();
