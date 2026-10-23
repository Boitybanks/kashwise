// Lets the app import the shared, framework-free iBanks engine from ../src/lib (one engine for web, server and apps).
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')
const config = getDefaultConfig(projectRoot)
config.watchFolders = [path.join(repoRoot, 'src', 'lib')]
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules'), path.join(repoRoot, 'node_modules')]
module.exports = config
