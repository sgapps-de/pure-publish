import tar from 'tar-stream';
import gunzip from 'gunzip-maybe';
import dot from 'dot-object';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { type Readable } from 'stream';
import multimatch from 'multimatch';

export interface ProcessInfo {

    match?: string | string[];
    header?: ((fx: FileProcessor, pi: ProcessInfo) => Promise<void> | void);
    proc?: string | ((fx: FileProcessor, pi: ProcessInfo) => Promise<void> | void);
    func?: Function;
}

export interface ProcessConfig {

    input:  string;
    output: string;

    removeInput?: boolean;

    proc: ProcessInfo[];
};

export class FileProcessor {

    out:    tar.Pack;
    header: tar.Headers;
    in:     Readable;

    cfg:    ProcessConfig;

    constructor(so: tar.Pack, header: tar.Headers, si: Readable, cfg: ProcessConfig) {

        this.out=so;
        this.header=header;
        this.in=si;
        this.cfg=cfg;
    }

    async process() {

        const n = this.header.name;
        let p: ProcessInfo | undefined;
    
        for (const px of this.cfg.proc) {
            if (!px.match) { p=px; break; }
            const mm = multimatch(n,px.match);
            if (mm.length>0) { p=px; break; }
        }
    
        p=p ?? { match: '', proc: 'copy' };

        if (p.header instanceof Function) {
            await p.header(this,p);
            if (!p.header?.name) return this.skipEntry();
        }

        if (p.proc instanceof Function) {
            const a:any = p.proc(this,p);
            if (a instanceof Promise) return a;
            return new Promise<void>((resolve,reject) => { resolve() });
        }

        switch ((p.proc ?? 'copy').toLowerCase()) {
            case 'json':
                return this.processJSON(p);
            case 'skip':
            case 'remove':
            case 'delete':
                return this.skipEntry();
            default:
                return this.copyEntry();
        }
    }

    async getData(): Promise<Buffer> {

        let buf: Buffer[] = [];

        const si = this.in;

        return new Promise<Buffer>((resolve, reject) => {
            si.on('data',(data) => {
                buf.push(data);
            });
            si.on('end',() => {
                resolve(Buffer.concat(buf));
            });
        });
    }

    async getText(enc: BufferEncoding = "utf8"): Promise<string> {

        let buf: string[] = [];

        const si = this.in;

        return new Promise<string>((resolve, reject) => {
            si.on('data',(data: Buffer) => {
                buf.push(data.toString(enc));
            });
            si.on('end',() => {
                resolve(buf.join(''));
            });
        });
    }

    async getJSON(enc: BufferEncoding = "utf8"): Promise<any> {

        const s = await this.getText(enc);

        return JSON.parse(s);
    }

    async writeJSON(jd: any, ind: string | number = 2): Promise<void> {

        const s = JSON.stringify(jd,undefined,ind);

        return this.writeText(s);
    }

    async writeText(s: string, enc: BufferEncoding = 'utf8'): Promise<void> {

        const b = Buffer.from(s,enc);

        return this.writeData(b);
    }

    async writeData(d: Buffer): Promise<void> {

        return new Promise<void>((resolve, reject) => {

            const h = { ...this.header, size: d.length };
    
            const out = this.out.entry(h,(err: any) => {
                if (err) {
                    this.out.finalize();
                    reject(err);
                }
                else {
                    resolve();
                }
            });

            out.write(d);
            out.end();
        });
    }

    async processJSON(pi: any): Promise<void> {

        const jd = await this.getJSON();

        if (pi.func instanceof Function)
            pi.func(jd,pi);

        else {
            if (pi.remove) {
                for (const r of pi.remove)
                    dot.delete(r,jd);
            }
     
            if (pi.replace) {
                for (const r in pi.replace)
                    dot.str(r,pi.replace[r],jd);
            }
        }

        return this.writeJSON(jd);
    }

    async copyEntry(): Promise<void> {

        return new Promise<void>((resolve, reject) => {
    
            const out = this.out.entry(this.header,(err: any) => {
                if (err) {
                    this.out.finalize();
                    reject(err);
                }
                else {
                    resolve();
                }
            });

            this.in.on('data',(data) => {
                out.write(data);
            });

            this.in.on('end',() => {
                out.end();
            });
        });
    }

    async skipEntry(): Promise<void> {

        return new Promise<void>((resolve, reject) => {
            this.in.on('end',() => {
                resolve();
            });

            this.in.resume();
        });
    }
}

export async function processTar(cfg: ProcessConfig): Promise<void> {

    return new Promise<void>((resolve, reject) => {
        const xs = tar.extract();
        const ps = tar.pack();

        const e = path.extname(cfg.output).toLowerCase();
        const ft = cfg.output+'.tmp'+e;

        xs.on('entry',(header: any,stream: Readable, next: () => void) => {
            const pp = new FileProcessor(ps,header,stream,cfg);
            pp.process().then(() => next()).catch((err:any) => { reject(err); });
        });

        xs.on('finish',() => {
            try {
                ps.finalize();
                if (cfg.removeInput) fs.rmSync(cfg.input,{force: true});
                fs.rmSync(cfg.output,{ force: true });
                fs.renameSync(ft,cfg.output);
                resolve();
            }
            catch(e: any) {
                reject(e);
            }
        });

        xs.on('error',(err: any) => {
            if (cfg.removeInput) fs.rmSync(cfg.input,{force: true});
            fs.rmSync(ft,{ force: true });
            reject(err);
        })

        let ws: any = fs.createWriteStream(ft);
        if (e==='.tgz' || e==='.gz') {
            const gzo = zlib.createGzip();
            gzo.pipe(ws);
            ps.pipe(gzo); }
        else
            ps.pipe(ws);

        fs.createReadStream(cfg.input).pipe(gunzip()).pipe(xs);
    });
}