# Change Log

All notable changes to the "shell-preview" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Improve output with exit code and stderr
- Terminate commands if not finished after a timeout (default 20s)
- Show a progress notification display with a cancel button for long running commands.
- Automatically open a preview on file open if the file type is configured (with customizable position and toggle settings)
- Respect fileAssociations declaration order to enable custom configuration priorities

## [0.0.3] - 2026-05-15

- Fix replacement of multiple occurences of `${file}` in command
- Updated dependencies

## [0.0.2] - 2023-11-12

- Initial release
