export class Logger {
    static log = (...data:any[]) => console.log(`[Emberline]`, ...data);
    static logErr = (...data:any[]) => console.error(`[Emberline]`, ...data);
}
