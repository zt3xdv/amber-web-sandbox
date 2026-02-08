# Amber Web Sandbox

Online [Amber](https://amber-lang.com) interpreter running in a browser-based x86 VM via [v86](https://github.com/copy/v86).

Boots in 2 seconds using a pre-saved VM state.

## Usage

Serve `public/` and open in browser, Boots in 2 seconds as mentioned above.

## Building

```bash
npm run build
```

Builds the filesystem and generates a compressed VM state at `public/dist/initial_state.bin`.

## Updating Amber

Replace `linux/system/bin/amber` with an **i386 static binary**, then rebuild.

```bash
file linux/system/bin/amber   # Must be ELF 32-bit LSB, Intel 80386
npm run build
```

## License

MIT
