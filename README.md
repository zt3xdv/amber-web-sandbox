# Amber Web Sandbox

Online [Amber](https://amber-lang.com) interpreter running in a browser-based x86 VM via [v86](https://github.com/copy/v86).

## Structure

```
public/                     # Served files
├── assets/
│   ├── filesystem.img      # Initrd (generated)
│   ├── main.js             # VM controller
│   └── styles.css
├── bios/                   # SeaBIOS + VGA BIOS
├── images/                 # bzImage (Linux kernel)
└── lib/                    # v86 (libv86.js, v86.wasm)

initrd/                     # Initrd sources
├── build_initrd.js         # Build script
├── permissions.json        # Permissions & symlinks
└── system/                 # Root filesystem
    └── bin/amber           # Amber i386 binary
```

v86 source available at https://github.com/copy/v86

## Usage

Serve `public/` and open in browser. VM boots in ~5-20s, well depending on client's device.

## Building Initrd

```bash
node initrd/build_initrd.js
```

Outputs `public/assets/filesystem.img`.

## Updating Amber

Replace `initrd/system/bin/amber` with an **i386 static binary**, then rebuild.

```bash
file initrd/system/bin/amber   # Must be ELF 32-bit LSB, Intel 80386
node initrd/build_initrd.js
```

## License

MIT
