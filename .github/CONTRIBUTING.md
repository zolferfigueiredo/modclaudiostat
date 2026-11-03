# Contributing

Thanks for helping with modclaudiostat. Bug reports, ideas and code are all welcome.

## Issues

- **Bugs and ideas**: [open an issue](https://github.com/zolferfigueiredo/modclaudiostat/issues/new/choose). Search the open ones first.
- **Security problems**: don't open an issue. Follow the [security policy](SECURITY.md).

## Pull requests

For anything bigger than a small fix, open an issue first so we can agree on the idea before you build it.

1. Fork the repository and branch from `main`.
2. Install the mod from your clone, as [Getting started](../README.md#getting-started) shows, so your sessions run
   your copy. After an edit, `/reload-plugins` picks it up.
3. Check the mod and run its tests. Both must pass:

   ```bash
   claude plugin validate .
   claude plugin test .
   ```

4. Open a pull request against `main`.

## License

By contributing, you agree that your work is licensed under the [MIT License](../LICENSE).
