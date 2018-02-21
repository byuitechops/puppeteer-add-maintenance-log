//Settings
const isBYUI = false
const filePart = 'JuliesOuListPathway'


//Constants 
const subDomain = isBYUI ? 'byui' : 'pathway'
const password = process.env.PASS || ''
const userName = process.env.NAME || 'Set your user name as an environment variable'
const filenameIn = filePart + '.csv'

const filenameOut = `report_${filePart}_${Date.now()}.csv`
const loginURL = `https://${subDomain}.brightspace.com/d2l/login?noredirect=true`



//Libraries
const puppeteer = require('puppeteer')
const chalk = require('chalk')

//The folling function was found here https://github.com/GoogleChrome/puppeteer/issues/537#issuecomment-334918553 on 2/1/2018
async function xpath(page, path) {
    const resultsHandle = await page.evaluateHandle(path => {
        let results = []
        let query = document.evaluate(path, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
        for (let i = 0, length = query.snapshotLength; i < length; ++i) {
            results.push(query.snapshotItem(i))
        }
        return results
    }, path)
    const properties = await resultsHandle.getProperties()
    const result = []
    const releasePromises = []
    for (const property of properties.values()) {
        const element = property.asElement()
        if (element)
            result.push(element)
        else
            releasePromises.push(property.dispose())
    }
    await Promise.all(releasePromises)
    return result
}

//this function will tell the browser to wait until we get a url in the location that 
//contains the url parameter.
function waitURL(page, url) {
    return new Promise(async function(fullfil, reject) {
        try {

            await page.waitForFunction(function(url) {
                var regEx = new RegExp(url)
                return window.location.href.match(regEx)
            }, {}, url)


            fullfil()
        } catch (error) {
            reject(error)
        }
    })
}



//this logs in to the backdoor log in to D2L
async function logIn(page) {
    await page.goto(loginURL)
    await page.type('#userName', userName)
    await page.type('#password', password)
    await Promise.all([
        page.waitForNavigation(),
        page.click('[primary=primary]')
    ])
    await waitURL(page, 'home')
}

//get list of courses
function getCourseList(fileName) {
    const fs = require('fs')
    const dsv = require('d3-dsv')
    const file = fs.readFileSync(fileName, 'utf8')
    return dsv.csvParse(file)
}

function writeReport(fileName, data) {
    const fs = require('fs')
    const dsv = require('d3-dsv')
    return new Promise(function(f, r) {
        try {
            data = dsv.csvFormat(data)
        } catch (e) {
            r(e)
        }

        fs.writeFile(fileName, data, 'utf8', function(error) {
            if (error) {
                r(error)
                return
            }

            f(true)
        })
    })
}


async function getLink(page, course) {
    //go to the course content view
    await page.goto(`https://${subDomain}.brightspace.com/d2l/lms/lti/manage/list.d2l?ou=${course.ou}`)

    course.changed = false

    var links = await page.$$eval('[title="Edit Course Maintenance Log"]',atags => [...atags].map(n => n.href))

    if(links.length == 0){
        throw 'Could\'nt find the course maintenace log'
    }
    if(links.length > 1){
        throw 'There is more than on course maintenance log'
    }

    await page.goto(links[0])

    const urlBox = '[value*="LTI"]'
    var oldValue = await page.$eval(urlBox,n => n.value)
    var newValue = await page.$eval(urlBox,n => n.value = n.value.replace('Home/TDReport/',''))
    if(oldValue != newValue){
        console.log(chalk.green('Changed it'))
        course.changed = true
    } else {
        console.log(chalk.yellow('Nothin to Change'))
    }
    await Promise.all([
        page.waitForNavigation(),    
        page.click('button[primary]')
    ])
}

async function main(){

    //get the course list
    var courseList = getCourseList(filenameIn),
        courseListOut = [],
        course, i

    const browser = await puppeteer.launch({headless: false})
    const page = await browser.newPage()
    await page.setViewport({
        width: 1800,
        height: 900
    })

    //go log
    await logIn(page)

    console.log(page.url())

    //do all the courses
    for (i = 0; i < courseList.length; ++i) {
        course = courseList[i]
        try {
            console.log(course.name.padEnd(50),course.ou,String(i).padEnd(3), ((i + 1) / courseList.length * 100).toFixed(2) + '%')
            //set up the course
            var loglink = await getLink(page, course)

        } catch (e) {
            //tell the world
            console.log(chalk.red('Error:', e.message))
            //record the error
            course.error = e.message
        }
    }

    //write out the report
    await writeReport(filenameOut, courseList)

    await browser.close()

    //await browser.close()
}

main()