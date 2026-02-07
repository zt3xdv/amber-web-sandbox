#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCRIPT_DIR = __dirname;
const SYSTEM_DIR = path.join(SCRIPT_DIR, 'system');
const PERMISSIONS_FILE = path.join(SCRIPT_DIR, 'permissions.json');
const OUTPUT_FILE = path.join(SCRIPT_DIR, '..', 'public', 'assets', 'filesystem.img');

let inoCounter = 721956;

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
        hex8(0) + // devmajor
        hex8(0) + // devminor
        hex8(0) + // rdevmajor
        hex8(0) + // rdevminor
        hex8(namesize) +
        hex8(0),  // check
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

function build() {
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
    
    fs.writeFileSync(OUTPUT_FILE, gzipped);
    console.log(`Creado: ${OUTPUT_FILE} (${gzipped.length} bytes)`);
}

build();
