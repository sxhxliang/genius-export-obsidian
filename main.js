const { FileSystemAdapter, Modal, Notice, Plugin, PluginSettingTab, Setting, getLanguage } = require("obsidian");
const { execFile } = require("node:child_process");
const path = require("node:path");
const { access, readdir } = require("node:fs/promises");
const { constants } = require("node:fs");

const defaults = { executable: "genius-cli", templates: "templates", desktopTemplates: "" };
const presets = ["genius", "base-cn", "report"];
const desktopNoteTemplate = "desktop-note";
const productWebsite = "https://gns.sh/";
const productDownload = "https://gns.sh/#download";

function defaultDesktopFolder() {
    const { XDG_CONFIG_HOME, APPDATA, HOME, USERPROFILE } = process.env;
    const home = HOME ?? USERPROFILE;
    const config = XDG_CONFIG_HOME ?? (process.platform === "win32" ? APPDATA : undefined)
        ?? (home === undefined ? "." : path.join(home, ".config"));
    return path.resolve(config, "genius", "templates");
}

class ExportDialog extends Modal {
    constructor(plugin, file, readText) {
        super(plugin.app);
        this.plugin = plugin;
        this.file = file;
        this.readText = readText;
    }

    onOpen() {
        const t = this.plugin.t;
        this.setTitle(t("Export note", "导出笔记"));
        let format = "pdf";
        let template = "";
        let overwrite = false;
        new Setting(this.contentEl).setName(t("Format", "格式")).addDropdown(dropdown =>
            dropdown.addOption("pdf", "PDF").addOption("docx", "Word (.docx)")
                .setValue(format).onChange(value => { format = value; }));
        new Setting(this.contentEl).setName(t("Template", "模板")).addDropdown(dropdown => {
            dropdown.addOption("", t("From note (vault templates)", "使用笔记设置（笔记库模板）"));
            dropdown.addOption(desktopNoteTemplate, t("From note (desktop templates)", "使用笔记设置（桌面端模板）"));
            for (const preset of presets) dropdown.addOption(preset, preset);
            const sources = [
                [false, t("Vault", "笔记库")],
                [true, t("Desktop", "桌面端")],
            ];
            void Promise.allSettled(sources.map(([desktop]) => this.plugin.listTemplates(desktop)))
                .then(results => results.forEach((result, index) => {
                    const label = sources[index][1];
                    if (result.status === "fulfilled") {
                        for (const file of result.value) dropdown.addOption(file, label + " · " + path.basename(file));
                    } else {
                        new Notice(t("Cannot read template folder\n", "无法读取模板目录\n")
                            + label + " · " + result.reason.message);
                    }
                }));
            dropdown.onChange(value => { template = value; });
        });
        new Setting(this.contentEl).setName(t("Overwrite existing file", "覆盖同名文件"))
            .addToggle(toggle => toggle.setValue(overwrite).onChange(value => { overwrite = value; }));
        new Setting(this.contentEl)
            .setDesc(t("The output is saved beside the note.", "导出文件保存在笔记旁。"))
            .addButton(button => button.setButtonText(t("Export", "导出")).setCta().onClick(() => {
                this.close();
                void this.plugin.exportNote(this.file, this.readText(), format, template, overwrite);
            }));
        const product = this.contentEl.createEl("small", {
            text: t("Genius Desktop · Markdown editor with typesetting templates. ", "Genius 桌面端 · 支持排版模板的 Markdown 编辑器。"),
        });
        product.createEl("a", {
            text: t("Download Genius", "下载 Genius"),
            href: productDownload,
            attr: { target: "_blank", rel: "noopener noreferrer" },
        });
    }
}

class ExportSettings extends PluginSettingTab {
    constructor(plugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl, plugin } = this;
        const t = plugin.t;
        containerEl.empty();
        new Setting(containerEl)
            .setName(t("Genius Desktop", "Genius 桌面端"))
            .setDesc(t(
                "A desktop Markdown editor with live preview, typesetting templates, and Word and PDF export.",
                "支持实时预览、排版模板以及 Word 和 PDF 导出的桌面 Markdown 编辑器。"))
            .addButton(button => button.setButtonText(t("Website", "产品官网"))
                .onClick(() => window.open(productWebsite, "_blank", "noopener")))
            .addButton(button => button.setButtonText(t("Download Genius", "下载 Genius")).setCta()
                .onClick(() => window.open(productDownload, "_blank", "noopener")));
        new Setting(containerEl)
            .setName(t("Genius CLI executable", "Genius CLI 可执行文件"))
            .setDesc(t("Leave blank to use the bundled CLI or PATH. Enter an absolute path to override it.", "留空时使用随插件安装的 CLI 或 PATH 中的 CLI。填写绝对路径可指定其他版本。"))
            .addText(text => text.setValue(plugin.settings.executable).onChange(async value => {
                plugin.settings.executable = value.trim();
                await plugin.saveData(plugin.settings);
            }));
        new Setting(containerEl)
            .setName(t("Genius Desktop template folder", "Genius 桌面端模板目录"))
            .setDesc(t("Leave blank to detect the folder, or enter its absolute path.", "留空自动查找，也可以填写桌面端模板目录的绝对路径。"))
            .addText(text => text.setPlaceholder(defaultDesktopFolder()).setValue(plugin.settings.desktopTemplates)
                .onChange(async value => {
                    plugin.settings.desktopTemplates = value.trim();
                    await plugin.saveData(plugin.settings);
                }));
        new Setting(containerEl)
            .setName(t("Template folder", "模板目录"))
            .setDesc(t("Vault-relative folder containing Genius YAML templates.", "填写相对于仓库根目录的 Genius YAML 模板目录。"))
            .addText(text => text.setValue(plugin.settings.templates).onChange(async value => {
                plugin.settings.templates = value.trim();
                await plugin.saveData(plugin.settings);
            }));
    }
}

module.exports = class GeniusExport extends Plugin {
    async onload() {
        this.t = (english, chinese) => getLanguage().startsWith("zh") ? chinese : english;
        this.settings = { ...defaults, ...await this.loadData() };
        this.addSettingTab(new ExportSettings(this));
        this.addCommand({
            id: "export-note",
            name: this.t("Export to PDF or Word", "导出为 PDF 或 Word"),
            editorCallback: (editor, view) => {
                if (view.file) new ExportDialog(this, view.file, () => editor.getValue()).open();
            },
        });
    }

    templateFolder() {
        const folder = this.settings.templates.trim().replace(/\/+$/, "");
        if (path.isAbsolute(folder) || folder.split(/[\\/]/).includes("..")) {
            throw new Error(this.t("Use a folder relative to the vault.", "请填写仓库内的相对目录。"));
        }
        return folder;
    }

    desktopTemplateFolder() {
        const folder = this.settings.desktopTemplates.trim();
        if (folder && !path.isAbsolute(folder)) {
            throw new Error(this.t("Use an absolute path for the desktop template folder.", "请填写桌面端模板目录的绝对路径。"));
        }
        return folder || defaultDesktopFolder();
    }

    async listTemplates(desktop) {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) return [];
        const vaultFolder = desktop ? "" : this.templateFolder();
        const folder = desktop ? this.desktopTemplateFolder() : vaultFolder && adapter.getFullPath(vaultFolder);
        if (!folder) return [];
        try {
            const entries = await readdir(folder, { withFileTypes: true });
            return entries.filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name))
                .map(entry => path.join(folder, entry.name)).sort((a, b) => a.localeCompare(b));
        } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
        }
    }

    async exportNote(file, markdown, format, template, overwrite = false) {
        const { adapter } = this.app.vault;
        if (!(adapter instanceof FileSystemAdapter)) {
            new Notice(this.t("A local vault is required.", "需要使用本地仓库。"));
            return;
        }
        if (this.exporting) {
            new Notice(this.t("An export is already running.", "已有导出任务正在运行。"));
            return;
        }
        this.exporting = true;
        const status = new Notice(this.t("Exporting note…", "正在导出笔记…"), 0);
        try {
            const source = adapter.getFullPath(file.path);
            const output = path.join(path.dirname(source), file.basename + "." + format);
            const args = ["-", "-o", output, "--title", file.basename,
                "--base-dir", path.dirname(source), "--root", adapter.getBasePath()];
            if (overwrite) args.push("--force");
            if (template === desktopNoteTemplate) {
                args.push("--templates-dir", this.desktopTemplateFolder());
            } else if (template) {
                args.push("--template", template);
            } else {
                const templates = this.templateFolder();
                if (templates) args.push("--templates-dir", adapter.getFullPath(templates));
            }
            let executable = this.settings.executable || defaults.executable;
            if (executable === defaults.executable && this.manifest.dir) {
                const binary = process.platform === "win32" ? "genius-cli.exe" : "genius-cli";
                const bundled = path.join(adapter.getFullPath(this.manifest.dir), "bin", binary);
                try {
                    await access(bundled, constants.X_OK);
                    executable = bundled;
                } catch (error) {
                    if (error.code !== "ENOENT") throw error;
                }
            }
            const warnings = await new Promise((resolve, reject) => {
                const child = execFile(executable, args,
                    { windowsHide: true, cwd: adapter.getBasePath() }, (error, _stdout, stderr) => {
                        if (error) reject(new Error(stderr.trim() || error.message));
                        else resolve(stderr.trim());
                    });
                child.stdin.on("error", error => {
                    if (error.code !== "EPIPE") reject(error);
                });
                child.stdin.end(markdown, "utf8");
            });
            new Notice(this.t("Exported ", "已导出 ") + path.basename(output));
            if (warnings) new Notice(warnings, 10000);
        } catch (error) {
            new Notice(this.t("Export failed\n", "导出失败\n") + error.message, 12000);
        } finally {
            status.hide();
            this.exporting = false;
        }
    }
};
