# ForgeFrame Localization QA

**Find missing translations, duplicated keys and broken placeholders without leaving VS Code.**

ForgeFrame Localization QA checks Unity-friendly localization CSV files and shows actionable diagnostics in the **Problems** panel. It runs locally, works without signing in and does not upload file content.

## What gets checked

- Missing source strings and target-language translations
- Repeated or missing localization keys
- Placeholder mismatches: \`{name}\`, supported printf specifiers and HTML-style markup
- Malformed CSV column counts
- Advanced ICU plural/select expressions that need manual review

Issues include a human-readable problem description and a suggested fix. Blocking issues appear as **Errors**, while ICU review items appear as **Warnings**.

## Quick start

1. Open a CSV file with a \`key\` column and at least two language columns.
2. Open the Command Palette (**Ctrl+Shift+P**).
3. Run **ForgeFrame Localization QA: Inspect Current CSV**.
4. Review the **Problems** panel. Click a problem to jump to its CSV row.
5. Use **ForgeFrame Localization QA: Browse Localization Findings** to browse issues, or **Export Localization Findings as CSV** to create a shareable report.

The status bar also shows the number of issues while a CSV document is active.

## Expected CSV format

\`\`\`csv
key,en,pl,de
welcome,"Welcome {name}","Witaj {name}","Willkommen {name}"
score,"Score: %d","Wynik: %d","Punkte: %d"
start,Start,Start,Starten
\`\`\`

The default source-language column is \`en\`. Change it in VS Code Settings if your original language is different. CSV files up to **2 MB** are supported.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| \`forgeframeLocalization.sourceLocale\` | \`en\` | Source language column |
| \`forgeframeLocalization.checkOnSave\` | \`true\` | Update diagnostics automatically when a CSV is saved |

The extension does not rewrite the original localization file.

## Export

Exported CSV reports contain priority, logical row number, key, language, issue, details and suggested correction. Export values are escaped to reduce spreadsheet formula-injection risk. A report is written only to the location you choose.

## Privacy

The extension reads the CSV document that you explicitly inspect, or an open CSV you save when automatic checking is enabled. All analysis happens locally. No account, tracking, external API, remote endpoint or telemetry is used.

## Limitations

This is a structural quality tool. It cannot verify linguistic quality, cultural appropriateness, runtime compatibility, fonts, layout or advanced ICU syntax. Quoted line breaks are handled when mapping logical CSV rows to editor lines, but an individual issue is highlighted at the **start** of the affected CSV record rather than marking an exact translated cell.

## Other ForgeFrame Labs tools

- [Free browser inspector](https://reflectme-source.github.io/forgeframe-labs-site/tools/localization-qa.html)
- [CSV guide](https://reflectme-source.github.io/forgeframe-labs-site/tools/localization-qa-guide.html)
- [Publisher support](https://reflectme-source.github.io/forgeframe-labs-site/support.html)

Support: forgeframe.lab@gmail.com
