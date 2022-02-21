import { Command, CommandOptions } from 'commander';
import path from 'path';
import { execSync } from 'child_process';
import fsp from 'fs/promises';
import fs  from 'fs';
import dot from 'dot-object';

interface ConfigObject {

    [key: string]: any;
}

interface PurePublishConfig {

    suffix:  string;

    indent:  string | number;

    remove?: string[];
    replace?: ConfigObject[];

}

class commandClass {

    program:        Command;

    myPackageFile!: string;
    myPackage!:     ConfigObject;
    version!:       string;

    root!:          string;
    packageFile!:   string;
    package!:       ConfigObject;

    purePackage?:   ConfigObject;

    opts!:          ConfigObject;
    dryRun!:        boolean;
    config!:        PurePublishConfig;

    constructor()

    {   this.program=new Command();
    }

    async run() {

        await this.getMyPackage();
        await this.getPackage();
        
        this.setupProgram();
        this.program.parse();
    }

    setupProgram()

    {   this.program
            .version(this.version)
            .option('-s, --suffix <suffix>','specify suffix for backup file - default \'.backup\'')
            .option('--dry-run','dry run - no real changes')
            .hook('preAction',this.preAction.bind(this));

        this.program
            .command('pure')
            .description('create pure version of package.json')
            .option('-x, --example')
            .action(this.cmdPure.bind(this));
                   
        this.program
            .command('restore')
            .description('restore original version of package.json')
            .action(this.cmdRestore.bind(this));
        
        this.program
            .command('pack')
            .description('create package tarball')
            .action(this.cmdPack.bind(this));
        
        this.program
            .command('publish',{ isDefault: true })
            .description('publish the package to the registry')
            .action(this.cmdPublish.bind(this));
        
        this.program
            .command('run <command...>')
            .description('run a command with the purified package.json')
            .action(this.cmdRun.bind(this));
    }

    async preAction(c: Command, ac: Command) {

        this.opts = Object.assign({},c.opts(),ac.opts());

        this.dryRun = this.opts.dryRun ?? false;;
        
        await this.getConfig(this.program.opts());
    }

    async cmdPure() {

        const fnb = this.packageFile+this.config.suffix;
        const fnt = fnb+'.tmp.json';

        if (fs.existsSync(fnb)) throw new Error(`'${path.basename(fnb)}' already exists`);

        this.purePackage=this.makePurePackage();

        const pps = JSON.stringify(this.purePackage,undefined,this.config.indent);

        if (this.dryRun) {
            console.log(`pure-publish: would copy 'package.json' to '${path.basename(fnb)}'`);
            console.log(`pure-publish: pure version of 'package.json':`);
            for (const ln of pps.split(/\r?\n/g)) {
                console.log('>  '+ln);
            }
            return;
        }

        try {
            await fsp.writeFile(fnt,pps);
            await fsp.rename(this.packageFile,fnb);
            await fsp.rename(fnt,this.packageFile);
        }
        catch(err: any) {
            if (fs.existsSync(fnt)) await fsp.unlink(fnt);
            throw err;
        }
    }

    async cmdRestore() {

        const fnb = this.packageFile+this.config.suffix;

        if (this.dryRun) {
            console.log(`pure-publish: would move '${path.basename(fnb)}' to 'package.json'`);
            return;
        }

        if (!fs.existsSync(fnb)) throw new Error(`'${path.basename(fnb)}' does not exist`);

        await fsp.unlink(this.packageFile);
        await fsp.rename(fnb,this.packageFile);
    }

    async cmdPack() {

        let err: any;

        await this.cmdPure();

        err=await this.exec(['npm','pack'].concat(this.program.args));
    
        this.cmdRestore();

        if (err) throw err;
    }

    async cmdPublish() {

        let err: any;

        await this.cmdPure();

        err=await this.exec(['npm','publish'].concat(this.program.args));
    
        this.cmdRestore();

        if (err) throw err;
    }

    async cmdRun(cmd: string[]) {

        let err: any;

        await this.cmdPure();

        err=await this.exec(cmd);
    
        this.cmdRestore();

        if (err) throw err;
    }

    async getMyPackage()

    {   const pfn = this.findPackageJson(__dirname);

        if (!pfn) throw new Error(`'package.json' of 'pure-publish' not found`);

        const ps = await fsp.readFile(pfn,'utf-8');

        this.myPackageFile = pfn;
        this.myPackage=JSON.parse(ps);
        this.version=this.myPackage.version ?? '1.0.0';
    }

    async getPackage()

    {   const pfn = this.findPackageJson('.');

        if (!pfn) throw new Error(`'package.json' not found`);

        const ps = await fsp.readFile(pfn,'utf-8');

        this.root=path.dirname(pfn);
        this.packageFile = pfn;
        this.package=JSON.parse(ps);
    }

    findPackageJson(dir: string) {

        let dd: string;

        dir=path.resolve(dir);

        for (;;dir=dd) {
            const fn = path.join(dir,'/package.json');
            if (fs.existsSync(fn)) return fn;
            dd=path.dirname(dir);
            if (dd===dir) break;
        }

        return null;
    }

    async getConfig(opts: ConfigObject) {

        let fnc: string;
        let c: ConfigObject = { };

        const pcx = this.package['pure-publish'];
        if (pcx instanceof Object) Object.assign(c,pcx);

        for (const fnx of [ 'pure-publish.config.js' ]) {
            fnc=path.join(this.root,fnx);
            if (!fs.existsSync(fnc)) continue;
            const cs = await fsp.readFile(fnc,'utf-8');
            const cx = JSON.parse(cs);
            Object.assign(c,cx);
        }

        this.config=c as PurePublishConfig;

        if (opts.suffix)
            c.suffix=opts.suffix;
        else if (!c.suffix)
            c.suffix = '.backup';

        if (!c.indent) c.indent=2;
    }

    makePurePackage() {

        const pp: ConfigObject = JSON.parse(JSON.stringify(this.package));

        if (this.config.remove) {
            for (const r of this.config.remove)
                dot.delete(r,pp);
        }

        if (this.config.replace) {
            for (const r in this.config.replace)
                dot.str(r,this.config.replace[r],pp);
        }

        return pp;
    }

    cmdPar(p: string) {

        if (!/['"\s]/.test(p)) return p;

        return "\""+p+"\"";
    }

    async exec(cmd: string[]): Promise<any> {

        const cs = cmd.map(this.cmdPar).join(' ');

        if (this.dryRun) {
            console.log("pure-publish: would execute:",cs);
            return null;
        }

        try {
            execSync(cs,{ cwd: this.root });
            return null;
        }
        catch(err: any) {
            return err;
        }
    }
}

const cc = new commandClass();
cc.run();