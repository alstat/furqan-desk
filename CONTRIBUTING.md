# Contributing to AyahLab

Thank you for helping improve AyahLab. This guide covers how to report bugs,
suggest features, correct data, and send pull requests.

## Scope: what AyahLab is for

AyahLab is made **purely for Qur'anic studies**, and for **Hadith studies**,
which are planned but not yet available. It is not a general-purpose
data-analysis tool or a general IDE.

The code editors, notebooks (Julia, Python, R, Lean), terminal and file
explorer are there to serve the study of these texts. Please keep this in mind
before opening a feature request or pull request:

- **In scope**: anything that helps someone read, understand, research,
  analyse, write about or teach the Qur'an (and, later, Hadith). For example:
  better morphology views, new translations or tafsir, search improvements,
  citation tools, analysis helpers for the Qur'anic dataset, and fixes to the
  existing editors and notebooks.
- **Out of scope**: features that turn AyahLab into a general IDE or a general
  data-science tool. For example: support for unrelated programming languages,
  general-purpose debuggers, package managers, extension marketplaces, or data
  connectors that have nothing to do with Qur'an or Hadith study.

If you are not sure whether an idea fits, open an issue and ask before writing
code.

## Reporting a bug

1. **Search first.** Check the
   [existing issues](https://github.com/alstat/furqan-desk/issues), including
   closed ones, in case it has already been reported or fixed.
2. **Open a new issue** at
   [github.com/alstat/furqan-desk/issues/new](https://github.com/alstat/furqan-desk/issues/new)
   with a short, specific title, for example "Tafsir window is blank for Surah
   2 in Arabic" rather than "Tafsir broken".
3. **Include the following**:

   - **AyahLab version.** It is in the window title, for example
     `AyahLab (v2.0.22)`.
   - **Operating system and version**, for example macOS 15.4, Windows 11 24H2
     or Ubuntu 24.04.
   - **How you installed it**: macOS app, Microsoft Store (MSIX), AppImage,
     `.deb`, `.rpm`, AUR (`ayahlab-bin`), or a build from source.
   - **Steps to reproduce**, numbered, starting from opening the app.
   - **What you expected** and **what happened instead**.
   - **Screenshots or a screen recording**, if the problem is visual.
   - **The Qur'an reference**, if the problem is about specific text, for
     example `2:255`, plus the translation, tafsir or reciter you had
     selected.

### If the app crashes on startup

AyahLab writes startup crashes to a log file and shows a dialog pointing to
it. Attach that file to the issue:

| OS | Crash log location |
| --- | --- |
| macOS | `$TMPDIR/AyahLab-crash.log` (open it with `open $TMPDIR/AyahLab-crash.log`) |
| Windows | `%TEMP%\AyahLab-crash.log` |
| Linux | `/tmp/AyahLab-crash.log` (or `$TMPDIR` if set) |

Check the log for anything private, such as your user name in file paths,
before you attach it.

**Linux only:** if the app aborts with
`Could not create default EGL display: EGL_BAD_PARAMETER`, try starting it with
`WEBKIT_DISABLE_DMABUF_RENDERER=1`. Please mention in the issue whether that
helped.

## Reporting a data problem

For mistakes in a translation, tafsir, word-by-word translation,
transliteration, morphology tag or recitation, open an issue and include:

- The exact reference (`surah:ayah`, and the word position for morphology).
- Which source you were using (translator, tafsir author or reciter).
- What is shown, and what you believe is correct, with a reference that
  supports it if you have one.

The Arabic text comes verbatim from the [Tanzil Project](https://tanzil.net)
and the morphology from the [Quranic Arabic Corpus](https://corpus.quran.com).
Their licenses don't allow changing them, so if a problem is in the source
itself, it also needs to be reported to that project. We will still want to
know about it.

## Suggesting a feature

Open an issue that describes:

- **The study need**: what you are trying to do as a student, teacher or
  researcher of the Qur'an or Hadith, and why the current app makes it hard.
- **Your idea for solving it**, if you have one. Mock-ups and screenshots help.

Feature requests are judged against the [scope](#scope-what-ayahlab-is-for)
above.

## Reporting a security issue

**Please don't open a public issue for security problems**, such as a way to
read another user's data, bypass sign-in, or run code through a crafted file.
Instead, report it privately through the repository's **Security** tab →
**Report a vulnerability** on GitHub. Include the steps to reproduce and the
version affected.

## Contributing code

### Before you start

- For anything larger than a small fix, **open an issue first** so we can agree
  on the approach before you spend time on it.
- Set up your environment by following
  [Getting started](README.md#getting-started) in the README, and read the
  [Architecture](README.md#architecture) section to see where things live.

### Making changes

1. Fork the repository and create a branch from `main` with a short,
   descriptive name, for example `fix-tafsir-scroll` or `add-hausa-wbw`.
2. Keep each pull request focused on one change. Unrelated refactors make
   review harder; send them separately.
3. Match the style of the surrounding code. Comments in this codebase explain
   *why* something is done, especially platform workarounds; please keep that
   up when you add non-obvious code.
4. Add or update tests for logic you change. Frontend tests use Vitest and live
   next to the code (`*.test.ts`) or in `tests/`. Backend tests are Rust
   `#[test]` functions in the module they test.

### Things to keep in mind

- **New Tauri commands** must be registered in `src-tauri/src/lib.rs`, and any
  new plugin permissions added under `src-tauri/capabilities/`.
- **Interface text** goes through the i18n system. Add new keys to
  `src/lib/i18n/locales/en.ts`; English is the fallback, so other locales can
  be translated later. Translations of existing keys into other languages are
  very welcome.
- **Dataset changes** (anything under `src-tauri/data/` or `gen-db/`) require
  bumping `DB_VERSION` in **both** `gen-db/src/main.rs` and
  `src-tauri/src/db.rs`, then regenerating with `cargo run -p gen-db --release`.
  Never edit the Tanzil text or Quranic Arabic Corpus files.
- **Cross-platform behaviour**: AyahLab ships on macOS, Windows and Linux. If
  your change touches files, processes, windows or the terminal, say in the
  pull request which platforms you tested on.
- **Never commit secrets** or generated files: `.env`, signing keys,
  certificates, `quran_static.db` and build output are all gitignored for a
  reason.

### Before you open the pull request

Run these and make sure they pass:

```sh
pnpm check            # type checking
pnpm vitest run       # frontend tests
cargo test -p AyahLab # backend tests (needs quran_static.db; see the README)
```

Then try your change in the running app with `pnpm tauri:dev`.

### The pull request

- Write a title that says what the change does, for example "Keep the tafsir
  window's scroll position when switching ayah".
- In the description, explain **why** the change is needed, link the issue it
  addresses (`Fixes #123`), list the platforms you tested on, and add
  screenshots for any visible change.
- Write commit messages with a short summary line in the imperative ("Add",
  "Fix", "Remove"), and a body explaining the reason for the change when it
  isn't obvious.

A maintainer will review the pull request and may ask for changes. Thank you
for contributing.
