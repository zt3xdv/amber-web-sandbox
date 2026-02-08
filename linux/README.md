# Linux VM

Root filesystem and build tools for the v86 VM. Contains busybox, bash, and amber.

## Build

```bash
npm run build
```

Generates compressed VM state at `public/dist/initial_state.bin` (~5mb kinda high but necesary).

## Structure

```
build.js          # Build script (filesystem + state generation)
images/           # bzImage (Linux kernel)
lib/              # v86 source files (libv86.js, v86.wasm)
src/              # v86 Node.js modules
permissions.json  # File modes and symlinks
system/           # Root filesystem
├── bin/          # amber, bash, busybox
└── init          # Init script
```

## Updating Amber

Amber must be **i386 Linux** (as v86 is 32-bit only). Static linking.

```bash
cp amber-i386 system/bin/amber
npm run build
```

## permissions.json

```json
{
  "files": {
    "/bin/amber": { "mode": "0755", "uid": 0, "gid": 0 }
  },
  "symlinks": {
    "/bin/sh": "busybox"
  }
}
```
