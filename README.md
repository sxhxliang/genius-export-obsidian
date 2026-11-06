# Genius Export

Export the active Markdown note to PDF or Word with Genius typesetting templates. Genius Export is a desktop plugin for Obsidian 1.8.7 or later.

## Install the complete package

1. Open [GitHub Releases](https://github.com/sxhxliang/genius-export-obsidian/releases/latest) and download the `genius-obsidian-…zip` that matches your system and CPU. Choose `aarch64` for Apple Silicon or ARM64, and `x86_64` for Intel or AMD 64-bit.
2. Extract the `genius-export` folder into the vault's `.obsidian/plugins/` folder. Reload Obsidian and enable **Genius Export** under Community plugins.
3. Leave **Genius CLI executable** blank to use the executable inside the package. Run **Genius Export: Export to PDF or Word** from the command palette.

## Install the plugin files separately

1. Obtain a Genius CLI for your operating system, or use the executable inside the matching platform ZIP.
2. Open **Settings → Genius Export** and enter the absolute path to the local `genius-cli` executable. On Windows the executable is named `genius-cli.exe`.
3. Open a Markdown note, run **Genius Export: Export to PDF or Word**, and choose a format and template. The export is written next to the note. Enable **Overwrite existing file** to replace an earlier export.

The template picker offers built-in templates, templates from the vault's `templates` folder, and templates from the Genius desktop configuration. Both folders can be configured in the plugin settings.

## Local processing and file access

The plugin sends the current editor buffer to the configured Genius CLI through standard input. The CLI runs as a local child process and reads local templates and document resources to create the output. The plugin accesses the configured executable and Genius desktop template folder, which may be outside the vault. Product and download buttons open the Genius website only when clicked. The plugin does not download or update the CLI automatically and does not send telemetry.

## License

Genius Export and the Genius CLI are Genius software. See [LICENSE](LICENSE) for the Genius license.
