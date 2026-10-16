# PassBundle web vault

The PassBundle web vault, an Angular app: the vault, the admin console for organizations, and the MSP console.

```sh
node ../../brand/apply.mjs        # from the repository root first, see the main README
npm run build:oss:selfhost:prod   # the open-source build; never a build:bit script
```

The build lands in `build/`, which the [PassBundle server](https://github.com/PimpinPumpkin/passbundle-server) serves.
