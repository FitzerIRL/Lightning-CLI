const path = require('path')
const fs = require('fs-extra')
const replaceInFile = require('replace-in-file')
const execa = require('execa')
const chalk = require('chalk')

const sequence = require('../helpers/sequence')
const ask = require('../helpers/ask')
const exit = require('../helpers/exit')
const spinner = require('../helpers/spinner')

/******* Questions *******/

const askAppName = () =>
  sequence([
    () => ask('What is the name of your Lightning App?', 'My Awesome App'),
    appName => validateAppName(appName),
  ])

const askAppId = () =>
  sequence([
    () =>
      ask('What is the App identifier? (reverse-DNS format)', 'com.metrological.app.myawesomeapp'),
    appId => validateAppId(appId),
  ])

const askAppFolder = appId =>
  sequence([
    () =>
      ask(
        'In what (relative) folder do you want to create the new App? (leave empty to create in current working dir)',
        appId
      ),
    appFolder => validateAppFolder(appFolder),
  ])

const askESlint = () =>
  ask('Do you want to enable ESlint?', null, 'list', ['Yes', 'No']).then(
    // map yes to true and no to false
    val => val === 'Yes'
  )

const askNpmInstall = () =>
  ask('Do you want to install the NPM dependencies now?', null, 'list', ['Yes', 'No']).then(
    // map yes to true and no to false
    val => val === 'Yes'
  )

const askGitInit = () =>
  ask('Do you want to initialize an empty GIT repository?', null, 'list', ['Yes', 'No']).then(
    // map yes to true and no to false
    val => val === 'Yes'
  )

const askConfig = () => {
  const config = {}
  return sequence([
    () => askAppName().then(appName => (config.appName = appName)),
    () => askAppId().then(appId => (config.appId = appId)),
    () => askAppFolder(config.appId).then(folder => (config.appFolder = folder)),
    () => askESlint().then(eslint => (config.eslint = eslint)),
    () => config,
  ])
}

const askInstall = config => {
  return sequence([
    () => askNpmInstall().then(npmInstall => (config.npmInstall = npmInstall)),
    () => askGitInit().then(gitInit => (config.gitInit = gitInit)),
    () => config,
  ])
}

/******* validations *******/

const validateAppId = appId => {
  if (!appId) {
    exit('Please provide an app ID')
  }
  // todo: add possible pre-processing
  // todo: validate if appId matches the requirements
  // todo: validate if appId isn't taken yet (in backoffice)
  return appId
}

const validateAppName = appName => {
  if (!appName) {
    exit('Please provide an app ID')
  }
  // todo: add possible pre-processing
  return appName
}

const validateAppFolder = folder => {
  // todo: validate if folder is correct path / doesn't exist etc.
  return folder
}

/******* Actions *******/

const copyLightningFixtures = config => {
  return new Promise(resolve => {
    const targetDir = path.join(process.cwd(), config.appFolder || '')
    if (config.appFolder && fs.pathExistsSync(targetDir)) {
      exit('The target directory ' + targetDir + ' already exists')
    }

    fs.copySync(path.join(__dirname, '../../fixtures/lightning-app'), targetDir)

    fs.copyFileSync(
      path.join(__dirname, '../../fixtures/vscode/app.code-workspace'),
      path.join(targetDir, '' + config.appName + '.code-workspace' )
    )

    resolve(targetDir)
  })
}

const setAppData = config => {
  replaceInFile.sync({
    files: config.targetDir + '/*',
    from: /\{\$appId\}/g,
    to: config.appId,
  })

  replaceInFile.sync({
    files: config.targetDir + '/*',
    from: /\{\$appName\}/g,
    to: config.appName,
  })
}

const addESlint = config => {
  fs.copyFileSync(
    path.join(__dirname, '../../fixtures/eslint/.editorconfig'),
    path.join(config.targetDir, '.editorconfig')
  )
  fs.copyFileSync(
    path.join(__dirname, '../../fixtures/eslint/.eslintignore'),
    path.join(config.targetDir, '.eslintignore')
  )
  fs.copyFileSync(
    path.join(__dirname, '../../fixtures/eslint/.eslintrc.js'),
    path.join(config.targetDir, '.eslintrc.js')
  )

  fs.writeFileSync(
    path.join(config.targetDir, 'package.json'),
    JSON.stringify(
      {
        ...JSON.parse(fs.readFileSync(path.join(config.targetDir, 'package.json'))),
        ...JSON.parse(fs.readFileSync(path.join(__dirname, '../../fixtures/eslint/package.json'))),
      },
      null,
      2
    )
  )

  return true
}

const createApp = config => {
  spinner.start('Creating Lightning App ' + config.appName)
  return sequence([
    () => copyLightningFixtures(config).then(targetDir => (config.targetDir = targetDir)),
    () => setAppData(config),
    () => config.eslint && addESlint(config),
    () =>
      new Promise(resolve => {
        setTimeout(() => {
          spinner.succeed()
          resolve()
        }, 2000)
      }),
    () => config,
  ])
}

const npmInstall = cwd => {
  spinner.start('Installing NPM dependencies')
  return execa('npm', ['install'], { cwd })
    .then(() => spinner.succeed('NPM dependencies installed'))
    .catch(e => spinner.fail(e))
}

const gitInit = cwd => {
  spinner.start('Initializing empty GIT repository')
  let msg
  return execa('git', ['init'], { cwd })
    .then(({ stdout }) => (msg = stdout))
    .then(() => {
      return fs.copyFileSync(
        path.join(__dirname, '../../fixtures/git/.gitignore'),
        path.join(cwd, '.gitignore')
      )
    })
    .then(() => spinner.succeed(msg))
    .catch(e => spinner.fail(e))
}

const install = config => {
  return sequence([
    () => config.npmInstall && npmInstall(config.targetDir),
    () => config.gitInit && gitInit(config.targetDir),
    () => config,
  ])
}

/******* Logs *******/

const done = config => {
  const label = '⚡️  "' + config.appName + '" successfully created!   ⚡️'

  console.log(' ')
  console.log('='.repeat(label.length))
  console.log(label)
  console.log('='.repeat(label.length))
  console.log(' ')

  console.log('👉  Get started with the following commands:')
  console.log(' ')
  config.appFolder &&
    console.log('   ' + chalk.grey('$') + chalk.yellow(' cd ' + chalk.underline(config.appFolder)))
  console.log('   ' + chalk.grey('$') + chalk.yellow(' lng build'))
  console.log('   ' + chalk.grey('$') + chalk.yellow(' lng serve'))
  console.log(' ')

  return config
}

module.exports = () => {
  sequence([
    askConfig,
    config => createApp(config),
    config => askInstall(config),
    config => install(config),
    config => done(config),
  ])
}
