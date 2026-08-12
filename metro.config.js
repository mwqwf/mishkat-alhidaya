const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// إضافة إعدادات خاصة بـ Realm
config.resolver.assetExts.push('realm');

// إضافة إعدادات لحل مشكلة HMRClient
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// إضافة إعدادات الشبكة للـ development client
config.server = {
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // إضافة headers لحل مشكلة CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.end();
        return;
      }
      
      return middleware(req, res, next);
    };
  },
};

// إضافة إعدادات لحل مشكلة Node modules
config.resolver.nodeModulesPaths = ['node_modules'];
config.resolver.extraNodeModules = {
  stream: require.resolve('readable-stream'),
};

module.exports = config; 