/// <reference types="node" />
import * as events from 'events';
export declare type TaskCompletionHandler = (err: any, data: any) => void;
export interface ITaskRunner {
    run: (task: any, done: TaskCompletionHandler) => void;
}
export interface Status {
    running: boolean;
    stopping: boolean;
}
export interface Progress {
    completed: number;
    total: number;
    completePercent: number;
    elapsedMS: number;
    estTotalMS: number;
    estRemainMS: number;
}
export interface TaskCompleteParams {
    task: any;
    err: any;
    data: any;
}
export declare class ConcurrentTasksRunner extends events.EventEmitter {
    taskRunner: ITaskRunner;
    private queue;
    maxConcurrent: number;
    private __available;
    private __completeResolve;
    private __running;
    private __stopping;
    private __completeCount;
    private __taskCount;
    private __startTime;
    constructor(taskRunner: ITaskRunner, maxConcurrent?: number);
    private incrementAvailability();
    private decrementAvailability(n);
    private readonly runningTasks;
    private readonly stillRunning;
    private running;
    private stopping;
    readonly status: Status;
    readonly progress: Progress;
    private getTaskCompletionHandler(task);
    private dispatchIfNecessary();
    run(tasks: any[], done: (cancel: boolean) => void): void;
    stop(): void;
}
