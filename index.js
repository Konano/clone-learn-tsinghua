const fs = require('fs');
const process = require('process');
// const _ = require('lodash');
const thuLearnLib = require('thu-learn-lib');
const thuLearnLibUtil = require('thu-learn-lib/lib/utils');
const crossFetch = require('cross-fetch');
const realIsomorphicFetch = require('real-isomorphic-fetch');
const textVersionJs = require('textversionjs');
const htmlEntities = require('html-entities').AllHtmlEntities;
const color = require('./color');

const rootDir = 'D:/Seafile/SYNC/learn.tsinghua';
const semesterIds = ['2019-2020-2', '2019-2020-3', '2020-2021-1'];

let helper = new thuLearnLib.Learn2018Helper();

let current = 0;
let all = 0;

function bytesToSize(bytes) {
    if (bytes === 0) return '0B';
    var k = 1024, sizes = ['B', 'K', 'M', 'G'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i == 2)
        return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + '.0' + sizes[i];
    return String(Math.floor(bytes / Math.pow(k, i)).toFixed(0)) + sizes[i];
}

function isSameSize(document_size, stats_size) {
    if (typeof document_size == 'string') {
        if (document_size[document_size.length - 1] === 'B') {
            return (document_size.substring(0, document_size.length - 1) == stats_size);
        } else {
            return (document_size == bytesToSize(stats_size));
        }
    } else {
        return (document_size == stats_size);
    }
}

function getAndEnsureSaveFileDir(semester, course) {
    let year = `${semester.startYear}-${semester.endYear}`;
    let semesterType = semester.type;
    let name = `${course.name}(${course.courseIndex})`;
    try {
        fs.mkdirSync(`${rootDir}/${year} ${semesterType}`);
    } catch (e) {
    }
    try {
        fs.mkdirSync(`${rootDir}/${year} ${semesterType}/${name}`);
    } catch (e) {
    }
    try {
        fs.mkdirSync(`${rootDir}/${year} ${semesterType}/${name}/notifications`);
    } catch (e) {
    }
    try {
        fs.mkdirSync(`${rootDir}/${year} ${semesterType}/${name}/homeworks`);
    } catch (e) {
    }
    return `${rootDir}/${year} ${semesterType}/${name}`;
}

function cleanFileName(fileName) {
    return fileName.replace(/[\/\\:\*\?\"\<\>\|]|[\x00-\x1F]/gi, '_').trim();
}

let tasks = [];

async function callback(semester, course, documents, cookies) {
    // documents = _.uniqBy(documents, 'title');
    all += documents.length;
    if (documents.length > 100) {
        current += documents.length;
        console.log(`${current}/${all}: Too many files skipped: ${course.name}`);
        return;
    }

    for (let document of documents) {
        // if (Date.now() - new Date(document.uploadTime).getTime() >
        //     1000 * 60 * 60 * 24 * 14) {
        //     current++;
        //     console.log(`${current}/${all}: Too old skipped: ${document.title}`);
        //     continue;
        // }
        let title = cleanFileName(document.title);

        let dir = getAndEnsureSaveFileDir(semester, course);

        let fileName = `${dir}/${title}.${document.fileType}`;

        try {
            const stats = fs.statSync(`${fileName}`);
            if (isSameSize(document.size, stats.size)) {
                current++;
                console.log(`${current}/${all}: Already downloaded skipped: ${document.title}`);
                continue;
            } else {
                console.log(`${color.FgMagenta}${document.title} Size mismatch: ` + document.size + ' vs ' + stats.size + `${color.Reset}`);
            }
        } catch (e) {

        }

        if (isNaN(document.size) && typeof document.size === 'string') {
            if (document.size[document.size.length - 1] === 'G' ||
                (document.size[document.size.length - 1] === 'M' &&
                    Number(document.size.substring(0, document.size.length - 1)) > 100) ||
                (document.size[document.size.length - 1] === 'B' &&
                    Number(document.size.substring(0, document.size.length - 1)) > 1024 * 1024 * 100)) {
                current++;
                console.log(`${color.FgRed}${current}/${all}: Too large skipped (${document.size}): ${document.title}${color.Reset}`);
                continue;
            }
        } else if (document.size > 1024 * 1024 * 100) {
            current++;
            console.log(`${color.FgRed}${current}/${all}: Too large skipped (${document.size}): ${document.title}${color.Reset}`);
            continue;
        }

        tasks.push((async () => {
            // launch async download task
            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
            let result = await fetch(document.downloadUrl);
            let fileStream = fs.createWriteStream(fileName);
            result.body.pipe(fileStream);
            await new Promise((resolve => {
                fileStream.on('finish', () => {
                    current++;
                    console.log(`${color.FgGreen}${current}/${all}: ${course.name}/${document.title}.${document.fileType} Downloaded${color.Reset}`);
                    resolve();
                });
            }));
        })());
    }
}

function addHashTag(fileName, hash) {
    let cut = fileName.lastIndexOf('.');
    if (cut > -1) {
        return fileName.substr(0, cut) + '_' + hash + '.' + fileName.substr(cut + 1);
    } else {
        return fileName + '_' + hash;
    }
}

(async () => {
    await helper.login(process.argv[2], process.argv[3]);
    const semesters = await helper.getSemesterIdList();
	// console.log(semesters);
    for (let semesterId of semesters) {
        if (semesterIds.indexOf(semesterId) != -1) {
            let semester = {
                id: semesterId,
                startYear: Number(semesterId.slice(0, 4)),
                endYear: Number(semesterId.slice(5, 9)),
                type: thuLearnLibUtil.parseSemesterType(Number(semesterId.slice(10, 11)))
            };
            const courses = await helper.getCourseList(semester.id);
            for (let course of courses) {
                const files = await helper.getFileList(course.id);
                await callback(semester, course, files, {});
                const notifications = await helper.getNotificationList(course.id);
                all += notifications.length;
                let dir = getAndEnsureSaveFileDir(semester, course);
                for (let notification of notifications) {
                    let title = cleanFileName(notification.title);
                    let file = `${dir}/notifications/${title}.txt`;
                    fs.writeFileSync(file, textVersionJs(notification.content));
                    current ++;
                    console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);
                    if (notification.attachmentUrl && notification.attachmentName) {
                        let attachmentName = cleanFileName(notification.attachmentName);
                        all ++;
                        if (Date.now() - new Date(notification.publishTime).getTime() >
                            1000 * 60 * 60 * 24 * 14) {
                            current++;
                            console.log(`${current}/${all}: Too old skipped: ${title}-${attachmentName}`);
                            continue;
                        }
                        let fileName = addHashTag(`${dir}/notifications/${title}-${attachmentName}`, notification.attachmentUrl.substr(-6));
                        if (fs.existsSync(fileName)) {
                            current++;
                            console.log(`${current}/${all}: Already downloaded skipped: ${title}-${attachmentName}`);
                            continue;
                        }
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(notification.attachmentUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${color.FgGreen}${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded${color.Reset}`);
                                    resolve();
                                });
                            }));
                        })());
                    }
                }
                const homeworks = await helper.getHomeworkList(course.id);
                all += homeworks.length;
                for (let homework of homeworks) {
                    let title = cleanFileName(htmlEntities.decode(homework.title));
                    if (Date.now() - new Date(homework.deadline).getTime() >
                        1000 * 60 * 60 * 24 * 14) {
                        current++;
                        console.log(`${current}/${all}: Too old skipped: ${title}`);
                        continue;
                    } else {
                        let file = `${dir}/homeworks/${title}.txt`;
                        let content = '';
                        if (homework.description !== undefined) {
                            content += `说明： ${textVersionJs(homework.description)}\n`;
                        }
                        if (homework.grade !== undefined) {
                            content += `分数： ${homework.grade} by ${homework.graderName}\n`;
                        }
                        if (homework.gradeContent !== undefined) {
                            content += `评语： ${homework.gradeContent}\n`;
                        }
                        fs.writeFileSync(file, content);
                        current ++;
                        console.log(`${current}/${all}: ${course.name}/${title}.txt Saved`);
                    }
                    if (homework.attachmentUrl && homework.attachmentName) {
                        let attachmentName = cleanFileName(homework.attachmentName);
                        all ++;
                        let fileName = addHashTag(`${dir}/homeworks/${title}-${attachmentName}`, homework.attachmentUrl.substr(-6));
                        if (fs.existsSync(fileName)) {
                            current++;
                            console.log(`${current}/${all}: Already downloaded skipped: ${title}-${attachmentName}`);
                            continue;
                        }
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.attachmentUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${color.FgGreen}${current}/${all}: ${course.name}/${title}-${attachmentName} Downloaded${color.Reset}`);
                                    resolve();
                                });
                            }));
                        })());
                    }
                    if (homework.submitted && homework.submittedAttachmentUrl && homework.submittedAttachmentName) {
                        let attachmentName = cleanFileName(homework.submittedAttachmentName);
                        all ++;
                        let fileName = addHashTag(`${dir}/homeworks/${title}-submitted-${homework.submittedAttachmentName}`, homework.submittedAttachmentUrl.substr(-6));
                        if (fs.existsSync(fileName)) {
                            current++;
                            console.log(`${current}/${all}: Already downloaded skipped: ${title}-submitted-${homework.submittedAttachmentName}`);
                            continue;
                        }
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.submittedAttachmentUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${color.FgGreen}${current}/${all}: ${course.name}/${title}-submitted-${homework.submittedAttachmentName} Downloaded${color.Reset}`);
                                    resolve();
                                });
                            }));
                        })());
                    }
                    if (homework.submitted && homework.gradeAttachmentUrl && homework.gradeAttachmentName) {
                        let attachmentName = cleanFileName(homework.gradeAttachmentName);
                        all ++;
                        let fileName = addHashTag(`${dir}/homeworks/${title}-graded-${homework.gradeAttachmentName}`, homework.gradeAttachmentUrl.substr(-6));
                        if (fs.existsSync(fileName)) {
                            current++;
                            console.log(`${current}/${all}: Already downloaded skipped: ${title}-submitted-${homework.gradeAttachmentName}`);
                            continue;
                        }
                        tasks.push((async () => {
                            let fetch = new realIsomorphicFetch(crossFetch, helper.cookieJar);
                            let result = await fetch(homework.gradeAttachmentUrl);
                            let fileStream = fs.createWriteStream(fileName);
                            result.body.pipe(fileStream);
                            await new Promise((resolve => {
                                fileStream.on('finish', () => {
                                    current++;
                                    console.log(`${color.FgGreen}${current}/${all}: ${course.name}/${title}-graded-${homework.gradeAttachmentName} Downloade${color.Reset}`);
                                    resolve();
                                });
                            }));
                        })());
                    }
                }
            }
        }
    }
    await Promise.all(tasks);
})();