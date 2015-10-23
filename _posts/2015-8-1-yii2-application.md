---
layout: post
title:  "Yii2 application & component"
date:   2015-8-1
categories: Yii
excerpt: application and component in Yii2
---

* content
{:toc}

### Request Lifecycle

1. make a request to entry script(index.php).
2. entry script loads the app.config and creates an application instance to handle the request.
3. app can resolve requested route by request components like urlmanager
4. Then app will create a controller instance.
5. controller creates an action instance and performs the filters for the action.
  * If any filter fails, the action is cancelled.
  * If all filters pass, the action is executed.
6. action loads a data model from database.
7. action renders a view, providing it with the data model.
8. The rendered result is returned to the response application component.
9. The response component sends the rendered result to the user's browser.

### Entry scripts mainly do the following work

 >> Web application and console application both have entry scripts like index.php

* Define global constants;
* Register Composer autoloader;
* Include the Yii class file;
* Load application configuration;
* Create and configure an application instance;
* Call yii\base\Application::run() to process the incoming request.

#### 栗子 in web application

{% highlight php startinline %}

<?php
defined('YII_DEBUG') or define('YII_DEBUG', true);
defined('YII_ENV') or define('YII_ENV', 'dev');

// register Composer autoloader
require(__DIR__ . '/../vendor/autoload.php');

// include Yii class file
require(__DIR__ . '/../vendor/yiisoft/yii2/Yii.php');

// load application configuration
$config = require(__DIR__ . '/../config/web.php');

// create, configure and run application
(new yii\web\Application($config))->run();

{% endhighlight %}


### Application Components

we can access to components by `\Yii::$app->componentID`,like `\Yii::$app->db` .

* The following application configuration makes sure the log component is always loaded in every application:

{% highlight php startinline %}
[
    'bootstrap' => [
        'log',
    ],
    'components' => [
        'log' => [
            // configuration for "log" component
        ],
    ],
]
{% endhighlight %}

### Core Application Components

* db
* errorHandler
* log
* mail
* urlManager
* response
* request
* user
* view
* assetManager
* formatter
* i18n
* session








