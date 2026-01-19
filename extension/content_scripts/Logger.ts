export class Logger {
    static log = (...data:any[]) => console.log(`[LeeAudio]`, ...data);
    static logErr = (...data:any[]) => console.error(`[LeeAudio]`, ...data);
}