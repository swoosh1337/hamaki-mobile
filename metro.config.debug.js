const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add custom serializer to debug the issue
const originalSerializer = config.serializer.customSerializer;
config.serializer.customSerializer = (entryPoint, preModules, graph, options) => {
    console.log('=== DEBUGGING MODULE RESOLUTION ===');

    // Check all modules for undefined paths
    graph.dependencies.forEach((module) => {
        if (!module.path || module.path === 'undefined') {
            console.error('❌ FOUND UNDEFINED MODULE PATH:');
            console.error('Module:', module);
            console.error('Dependencies:', module.dependencies);
        }
    });

    if (originalSerializer) {
        return originalSerializer(entryPoint, preModules, graph, options);
    }

    return require('expo/metro-config').createModuleIdFactory()(entryPoint, preModules, graph, options);
};

module.exports = config;
