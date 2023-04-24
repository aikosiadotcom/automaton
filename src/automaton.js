import axios from "axios";
import {chromium} from 'playwright-core';
import Ability from "./ability.js";
import MustOverrideError from "./error/must_override_error.js";

/**
 * @extends Ability
 */
class Automaton extends Ability{
    #browser;
    _context;
    _manifest;
    _endpoint;

    constructor(config){
        super(config);
        const {daemon: daemonConfig = {}} = config ?? {};

        let {host,port} = daemonConfig ?? {};
        if(Object.keys(daemonConfig).length == 0){
            host = process.env.AUTOMATON_DAEMON_HOST || "http://localhost";
            port = process.env.AUTOMATON_DAEMON_PORT || 3000;
        }

        this._endpoint = `${host}:${port}/browser`;

        //fungsi ini diperlukan agar bisa set manifest saat instantiate class
        this.emitter.once('_setManifest',(manifest)=>{
            this.setManifest(manifest);

            //must call before setManifest cause dependency
            this.#initialize();
        });

        this.emitter.once('ready',async()=>{
            this.profiler.start("execution");
            await this.emitter.emit("_start");

            /**runParameter */
            if(this._manifest.runParameter == "page"){
                const page = await this._context.newPage();
                await this.run(page);
                await page.close();
            }else if(this._manifest.runParameter == "context"){
                await this.run(this._context);
            }else{
                await this.run(null);
            }

            await this.emitter.emit('_end',this.profiler.stop("execution"));
        });
    }

    async #initialize(){
        const {data} = await axios.get(`${this._endpoint}/${this._manifest["profile"]}`);
        this.#browser = await chromium.connectOverCDP(data);
        this._context = this.#browser.contexts()[0];

        //TODO: kedepan ada waktu ubah jadi plugin saja, menambahkan new method ke Page Class. 
        this._context.on("page",(page)=>{
            page.automaton = {};
            page.automaton.waitForResponse = async({goto,waitUrl,responseType="json"})=>{
                const responsePromise  = page.waitForResponse((resp)=>resp.url().includes(waitUrl));
                await page.goto(goto);
                const response = await responsePromise;
                return await response[responseType]();
            }
            return page;
        });

        this.emitter.emit('ready');
    }

    /**
     * The argument is based on key runParameter, if not found default to Page
    */
    async run(contextOrPageOrNone){
        throw new MustOverrideError('please override run method. example: async run(contextOrPageOrNone)=>{}');
    }

    setManifest(manifest){
        this._manifest = manifest;
    }
}

export default Automaton;