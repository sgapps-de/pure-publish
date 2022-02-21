# Pure-Publish

> Publish node packages with a purified 'package.json'

## Install

```sh
npm install pure-publish -D
```

## Usage

```sh
pure-publish [command]
```

### Command `publish`

This is the default command.

A tarball is created and published to the registry using the command

```sh
npm publish <tarball>
```

The tarball is deleted after running `npm publish`.

### Command `pack`

A tarball file of the package is created. The file 'package.json' inside of this tarball is purified.

### Command `pure`

The file 'package.json' is purified. The original file is copied to 'package.json.backup'.

### Command `restore`

The file 'package.json' is restored from a previously saved backup - see command `pure` above. The backup file is deleted.

### Command `run <cmd>`

After 'package.json' is purified the specifed `<cmd>` is executed. Afterwards the original version of 'package.json' is restored.

### Options

#### `--suffix <sfx>`

Instead of 'package.json.backup' the backup file will be name 'package.json`<sfx>`'

#### `--tarball <path>`

Alternative path for the generated tarball. If the file name is '*' it will be replaced by the standard name. For example:
```sh
pure-publish pack --tarball "./.pack/*"
```

### `--dry-run`

Do not change any file or do the real publishing. Show only what would be done. Also dump the purified version of 'package.json'.

## Configuration

The configuration is read from the key 'pure-publish' of 'package.json' or from the file 'pure-publish.config.json'. Example:
```json
{
   "suffix": ".bak",
   "tarball": "./.pack/*",
   "indent": 2,
   "remove": [
       "devDependencies",
       "pure-package",
       "files"
   ],
   "replace": {
       "scripts": {
           "test": "echo \"No tests defined!\" && exit 1"
       }
   }
}
```

Possible keys are:

### suffix

Type: string

Same as option `--suffix`.

### tarball

Type: string

Same as option `--tarball`.

### indent

Type: string | number

Indentation of the purified 'package.json' - default 2.

### remove

Type: string[]

The keys specified in `remove` are removed from 'package.json'

### replace

Type: object

The contents of 'package.json' are combined with the object. 