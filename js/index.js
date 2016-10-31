"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var events = require('events');
var Promise = require('promise');
var Queue = (function (_super) {
    __extends(Queue, _super);
    function Queue() {
        _super.call(this);
        this.__queue = [];
    }
    Queue.prototype.addTasks = function (tasks) {
        if (tasks && tasks.length > 0) {
            var added = false;
            for (var i in tasks) {
                if (tasks[i]) {
                    this.__queue.push(tasks[i]);
                    if (!added)
                        added = true;
                }
            }
            if (added) {
                this.emit('enqueued');
            }
        }
    };
    Queue.prototype.dequeue = function (maxToDequeue) {
        var ret = [];
        while (this.__queue.length > 0 && ret.length < maxToDequeue) {
            ret.push(this.__queue.shift());
        }
        return (ret.length === 0 ? null : ret);
    };
    Queue.prototype.clear = function () {
        this.__queue = [];
    };
    Object.defineProperty(Queue.prototype, "empty", {
        get: function () { return (this.__queue.length === 0); },
        enumerable: true,
        configurable: true
    });
    return Queue;
}(events.EventEmitter));
// emits the following events
// 1. start
// 2. end
// 3. status-changed (Status)
// 4. task-start (task)
// 5. task-complete (TaskCompleteParams)
// 6. progress (Progress)
var ConcurrentTasksRunner = (function (_super) {
    __extends(ConcurrentTasksRunner, _super);
    function ConcurrentTasksRunner(taskRunner, maxConcurrent) {
        var _this = this;
        if (maxConcurrent === void 0) { maxConcurrent = 2; }
        _super.call(this);
        this.taskRunner = taskRunner;
        this.queue = new Queue();
        if (!maxConcurrent || isNaN(maxConcurrent) || maxConcurrent < 1)
            maxConcurrent = 1;
        this.maxConcurrent = maxConcurrent;
        this.__available = this.maxConcurrent;
        this.__completeResolve = null;
        this.__running = false;
        this.__stopping = false;
        this.__completeCount = 0;
        this.__taskCount = 0;
        this.__startTime = null;
        this.queue.on('enqueued', function () {
            _this.dispatchIfNecessary();
        });
    }
    ConcurrentTasksRunner.prototype.incrementAvailability = function () {
        this.__available++;
        this.dispatchIfNecessary();
    };
    ConcurrentTasksRunner.prototype.decrementAvailability = function (n) {
        this.__available -= n;
    };
    Object.defineProperty(ConcurrentTasksRunner.prototype, "runningTasks", {
        get: function () {
            return (this.__available < this.maxConcurrent);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ConcurrentTasksRunner.prototype, "stillRunning", {
        get: function () {
            return (!this.queue.empty || this.runningTasks);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ConcurrentTasksRunner.prototype, "running", {
        get: function () {
            return this.__running;
        },
        set: function (newValue) {
            if (newValue != this.__running) {
                this.__running = newValue;
                this.emit('status-changed', this.status);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ConcurrentTasksRunner.prototype, "stopping", {
        get: function () {
            return this.__stopping;
        },
        set: function (newValue) {
            if (newValue != this.__stopping) {
                this.__stopping = newValue;
                this.emit('status-changed', this.status);
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ConcurrentTasksRunner.prototype, "status", {
        get: function () {
            return { running: this.running, stopping: this.stopping };
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(ConcurrentTasksRunner.prototype, "progress", {
        get: function () {
            if (this.__taskCount > 0) {
                var completeFraction = this.__completeCount / this.__taskCount;
                var completePercent = completeFraction * 100.0;
                var elapsedMS = new Date().getTime() - this.__startTime.getTime();
                var estTotalMS = (this.__completeCount ? elapsedMS / completeFraction : null);
                var estRemainMS = (estTotalMS ? estTotalMS - elapsedMS : null);
                return {
                    completed: this.__completeCount,
                    total: this.__taskCount,
                    completePercent: completePercent,
                    elapsedMS: elapsedMS,
                    estTotalMS: estTotalMS,
                    estRemainMS: estRemainMS
                };
            }
            else {
                return null;
            }
        },
        enumerable: true,
        configurable: true
    });
    ConcurrentTasksRunner.prototype.getTaskCompletionHandler = function (task) {
        var _this = this;
        return function (err, data) {
            _this.incrementAvailability();
            _this.__completeCount++;
            _this.emit('progress', _this.progress);
            _this.emit('task-complete', { task: task, err: err, data: data });
            if (!_this.stillRunning)
                _this.__completeResolve(null);
        };
    };
    ConcurrentTasksRunner.prototype.dispatchIfNecessary = function () {
        var tasks = null;
        if (this.__available > 0 && (tasks = this.queue.dequeue(this.__available))) {
            this.decrementAvailability(tasks.length);
            for (var i in tasks) {
                var task = tasks[i];
                this.emit('task-start', task);
                this.taskRunner.run(task, this.getTaskCompletionHandler(task));
            }
        }
    };
    ConcurrentTasksRunner.prototype.run = function (tasks, done) {
        var _this = this;
        if (!this.running && !this.stopping && tasks && tasks.length > 0) {
            this.__completeCount = 0;
            this.__taskCount = tasks.length;
            this.__startTime = new Date();
            this.running = true;
            this.emit('start');
            var p = new Promise(function (resolve, reject) {
                _this.__completeResolve = resolve;
            });
            p.then(function () {
                var cancel = _this.stopping;
                _this.stopping = false;
                _this.running = false;
                _this.emit('end');
                if (typeof done === 'function')
                    done(cancel);
            });
            this.queue.addTasks(tasks);
        }
    };
    ConcurrentTasksRunner.prototype.stop = function () {
        if (this.running && !this.stopping) {
            this.stopping = true;
            this.queue.clear(); // clear the queue
        }
    };
    return ConcurrentTasksRunner;
}(events.EventEmitter));
exports.ConcurrentTasksRunner = ConcurrentTasksRunner;
