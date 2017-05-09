import * as events from 'events';

export type TaskCompletionHandler = (err:any, data:any) => void;
export interface ITaskRunner {
    run: (task:any, done: TaskCompletionHandler) => void;   
} 

export interface Status {
    running: boolean;
    stopping: boolean;
}

export interface Progress {
    completed: number;
    total: number;
    completePercent:number;
    elapsedMS:number;
    estTotalMS:number;
    estRemainMS:number;
}

export interface TaskCompleteParams {
    task: any;
    err: any;
    data: any;
}

type ResolveType = (value: any) => void;
type RejectType = (reason: any) => void;

class Queue extends events.EventEmitter {
    private __queue: any[] = [];
    constructor() {
        super();
    }
    addTasks(tasks: any[]) {
        if (tasks && tasks.length > 0) {
            let added = false;
            for (let i in tasks) {
                if (tasks[i]) {
                    this.__queue.push(tasks[i]);
                    if (!added) added = true;
                }
            }
            if (added) {
                this.emit('enqueued');
            }
        }
    }
    dequeue(maxToDequeue: number) : any[]  {
        let ret:any[] = [];
        while (this.__queue.length > 0 && ret.length < maxToDequeue) {
            ret.push(this.__queue.shift());
        }
        return (ret.length === 0 ? null : ret);
    }
    clear() {
        this.__queue = [];
    }
    get empty(): boolean {return (this.__queue.length === 0);}
}

// emits the following events
// 1. start
// 2. end
// 3. status-changed (Status)
// 4. task-start (task)
// 5. task-complete (TaskCompleteParams)
// 6. progress (Progress)
export class ConcurrentTasksRunner extends events.EventEmitter {
    private queue: Queue = new Queue();
    public maxConcurrent: number;
    private __available: number;
    private __completeResolve: ResolveType;
    private __running: boolean;
    private __stopping: boolean;
    private __completeCount: number;
    private __taskCount: number;
    private __startTime: Date;

    constructor(public taskRunner: ITaskRunner, maxConcurrent: number = 2) {
        super();
        if (!maxConcurrent || isNaN(maxConcurrent) || maxConcurrent < 1) maxConcurrent = 1;
        this.maxConcurrent = maxConcurrent;
        this.__available = this.maxConcurrent;
        this.__completeResolve = null;
        this.__running = false;
        this.__stopping = false;
        this.__completeCount = 0;
        this.__taskCount = 0;
        this.__startTime = null;
        this.queue.on('enqueued', () => {
            this.dispatchIfNecessary();
        });
    }
    private incrementAvailability() {
        this.__available++;
        this.dispatchIfNecessary(); 
    }
    private decrementAvailability(n: number) {
        this.__available -= n;
    }
    private get runningTasks() : boolean {
        return (this.__available < this.maxConcurrent);
    }
    private get stillRunning() : boolean {
        return (!this.queue.empty || this.runningTasks);
    }
    
    private get running() : boolean {
        return this.__running;
    }
    private set running(newValue: boolean) {
        if (newValue != this.__running) {
            this.__running = newValue;
            this.emit('status-changed', this.status);
        }
    }
    private get stopping() : boolean {
        return this.__stopping;
    }
    private set stopping(newValue: boolean) {
        if (newValue != this.__stopping) {
            this.__stopping = newValue;
            this.emit('status-changed', this.status);
        }
    }
    get status() : Status {
        return {running: this.running, stopping: this.stopping};
    }

    get progress():Progress {
        if (this.__taskCount > 0) {
            let completeFraction = this.__completeCount/this.__taskCount;
            let completePercent = completeFraction * 100.0;
            let elapsedMS = new Date().getTime() - this.__startTime.getTime();
            let estTotalMS = (this.__completeCount ? elapsedMS / completeFraction : null);
            let estRemainMS = (estTotalMS ? estTotalMS - elapsedMS : null);
            return {
                completed: this.__completeCount
                ,total: this.__taskCount
                ,completePercent
                ,elapsedMS
                ,estTotalMS
                ,estRemainMS
            };
        } else {
            return null;
        }
    }

    private getTaskCompletionHandler(task:any): TaskCompletionHandler {
        return (err:any, data:any) => {
            this.incrementAvailability();
            this.__completeCount++;
            this.emit('progress', this.progress);
            this.emit('task-complete', {task, err, data});
            if (!this.stillRunning)
                this.__completeResolve(null);
        }
    }

    private dispatchIfNecessary() {
        let tasks: any[] = null;
        if (this.__available > 0 && (tasks = this.queue.dequeue(this.__available))) {
            this.decrementAvailability(tasks.length);
            for (let i in tasks) {
                let task = tasks[i];
                this.emit('task-start', task);
                this.taskRunner.run(task, this.getTaskCompletionHandler(task));
            }
        }
    }

    run(tasks: any[], done: (cancel: boolean) => void) {
        if (!this.running && !this.stopping && tasks && tasks.length > 0) {
            this.__completeCount = 0;
            this.__taskCount = tasks.length;
            this.__startTime = new Date();
            this.running = true;
            this.emit('start');
            let p = new Promise<any>((resolve: ResolveType, reject: RejectType) => {
                this.__completeResolve = resolve;
            });
            p.then(() => {
                let cancel = this.stopping;
                this.stopping = false;
                this.running = false;
                this.emit('end');
                if (typeof done === 'function') done(cancel);
            });
            this.queue.addTasks(tasks);
        }
    }

    stop() {
        if (this.running && !this.stopping) {
            this.stopping = true;
            this.queue.clear(); // clear the queue
        }
    }
}