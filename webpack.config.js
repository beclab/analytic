/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');
// fork-ts-checker-webpack-plugin需要单独安装
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const AddAssetPlugin = require('add-asset-webpack-plugin');
const package = require('./package.json');
const CopyPlugin = require('copy-webpack-plugin');

const isProduction = process.env.NODE_ENV == 'production';

const config = {
  entry: './src/main',
  target: 'node',
  // 置为空即可忽略webpack-node-externals插件
  externals: {
    bcrypt: 'commonjs2 bcrypt',
    '@prisma/client': 'commonjs2 @prisma/client',
    prisma: 'commonjs2 prisma',
  },
  // ts文件的处理
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
        exclude: /node_modules/,
      },
    ],
  },
  // 打包后的文件名称以及位置
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  plugins: [
    // 需要进行忽略的插件
    new webpack.IgnorePlugin({
      checkResource(resource) {
        const lazyImports = [
          '@nestjs/microservices',
          '@nestjs/microservices/microservices-module',
          '@nestjs/websockets/socket-module',
          'cache-manager',
          'class-validator',
          'class-transformer',
        ];
        if (!lazyImports.includes(resource)) {
          return false;
        }
        try {
          require.resolve(resource, {
            paths: [process.cwd()],
          });
        } catch (err) {
          return true;
        }
        return false;
      },
    }),
    new CopyPlugin({
      patterns: [
        // {
        // 	from: 'node_modules/.prisma',
        // 	to: 'node_modules/.prisma'
        // },
        {
          from: 'node_modules/@prisma/client',
          to: 'node_modules/@prisma/client',
        },
        // },
        {
          from: 'node_modules/.prisma',
          to: 'node_modules/.prisma',
        },
        {
          from: 'prisma',
          to: 'prisma',
        },
        // {
        //   from: './../../node_modules/.prisma/client/libquery_engine-*',

        //   to: ({ context, absoluteFilename }) => {
        //     return `./${path.basename(absoluteFilename)}`;
        //   },
        // },
      ],
    }),
    new ForkTsCheckerWebpackPlugin(),
    new AddAssetPlugin('./package.json', createPackage),
  ],
};

function createPackage() {
  const externals = config.externals;
  const externalsKeys = Object.keys(externals);
  const dependencies = package.dependencies;
  const externals_dependencies = {};

  for (const key in dependencies) {
    if (externalsKeys.includes(key)) {
      externals_dependencies[key] = dependencies[key];
    }
  }

  const packages = {
    dependencies: externals_dependencies,
    scripts: {
      server: 'node main.js',
      generate: 'prisma generate',
      'db:migrate:deploy': 'prisma migrate deploy',
    },
  };
  return JSON.stringify(packages);
}

module.exports = () => {
  if (isProduction) {
    config.mode = 'production';
  } else {
    config.mode = 'development';
  }
  return config;
};
