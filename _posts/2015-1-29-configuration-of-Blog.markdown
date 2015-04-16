---
layout: post
title:  "Configuration Of GitHub Page"
date:   2015-1-29 14:34:25
categories: tech
tags: tech
description: The process and experience of blog building on GitHub,includes configurations of git&&jekyll and introduction of liquid simply... ...
image: /assets/images/effiel.JPG
---


##github page
>github-page是一个免费的静态网站托管平台，由github提供，它具有以下特点：

>1. 免空间费,免流量费
>2. 具有项目主页和个人主页两种选择
>3. 支持页面生成，可以使用jekyll来布局页面，使用markdown来书写正文可以自定义域名

我要介绍的是个人主页（windows）

每个帐号只能有一个仓库来存放个人主页，而且仓库的名字必须是username/username.github.io，这是特殊的命名约定。你可以通过http://username.github.io来访问你的个人主页。个人主页的网站内容是在master分支下的。

##Setup jekyll for windows
在建完仓库之后，需要配置本地测试环境.配置过程主要分为以下几步：

- 安装ruby
- 安装Devkit
- 安装jekyll
- 安装Pygments
- 启动jekyll&&测试

###安装ruby
我这里选择2.7.8版本的，无脑安装，记得勾选Add Ruby executables to your PATH,这样就省去了添加环境变量.
打开cmd 可用ruby -v测试是否安装成功.

###安装Devkit
需要注意Devkit版本需要和ruby一致.
解压至某文件夹后，用cmd进入该目录.

运行ruby dk.rb init

(这条命令只对使用rubyinstall安装的ruby有效,如果是其他方式安装的话，需要手动修改config.yml,于末尾添加新的一行 - C:\Ruby200-x64)

然后执行,执行ruby dk.rb install

###安装Rubygems
解压后，用cmd进入该目录,执行ruby setup.rb  

如果希望加快应用的下载速度,还是选择淘宝的镜像比较好.

###安装jekyll
- 确保gem已经安装（gem -v）
- 执行 gem install jekyll,jekyll依赖的组件会自动下载安装

###安装Pygments
Pygments是jekyll中默认的语法高亮插件,它需要安装python并在网站的配置文件_config.yml里将highlighter 的值设置为pygments

- 安装python（记得添加环境变量）
- 安装easy install, 下载ez\_setup.py,用cmd到下载目录执行 python ez_setup.py
- 添加Python Scripts路径 (如C:\Python27\Scripts) 至 PATH
- 确保easy\_install安装好之后执行 easy\_install Pygments

###启动jekyll
- jekyll new myblog
- cd myblog
- jekyll serve












