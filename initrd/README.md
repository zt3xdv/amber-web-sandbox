# Initrd

Root filesystem for the VM. Contains busybox, bash, and amber.

## Build

```bash
node build_initrd.js
```

Creates gzipped CPIO at `../public/assets/filesystem.img`.

## Structure

```
system/           # Root filesystem
├── bin/          # amber, bash, busybox
├── lib/          # Shared libs (if needed)
└── init          # Init script

permissions.json  # File modes and symlinks
```

## Updating Amber

Amber must be **i386 Linux** (v86 is 32-bit). Static linking recommended.

```bash
cp amber-i386 system/bin/amber
node build_initrd.js
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
