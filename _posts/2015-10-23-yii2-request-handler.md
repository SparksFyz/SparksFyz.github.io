---
layout: post
title:  "Yii2 Request Handler"
date:   2015-10-23
categories: Yii
excerpt: Request Handler and Route in Yii2
---

* content
{:toc}

> Request handling can be divided into two steps:

+ __Bootstrapping__
+ __Routing__

## Bootsrapping

> Bootstrapping is before an application starts to resolve and process an incoming request.

启动引导会在两个地方具体进行：

* Entry Script(web/index.php)
    * 引入composer和Yii的autoloader
    * 加载configuration 并创建一个application的实例。
* 应用主体（application）：
    * 生成application实例，参见下面的`yii/base/application`中的构造函数，
    * `yii/base/application`中的init()方法会调用bootstrap()方法从而bootstapping components.

    {% highlight php %}
    public function __construct($config = [])
    {
        //这里的config[]参见config/main.php
        Yii::$app = $this;
        //生成一个application实例
        $this->setInstance($this);

        $this->state = self::STATE_BEGIN;
        //preInit(&$config)方法会初始化一些重要的app属性，
        //例如`id`，`basePath`,并将core components和custom components合并
        $this->preInit($config);
        //注册ErrorHandler
        $this->registerErrorHandler($config);
        //初始化配置的component的属性
        Component::__construct($config);
    }

    public function init()
    {
        $this->state = self::STATE_INIT;
        $this->bootstrap();
    }

    protected function bootstrap()
    {
        if ($this->extensions === null) {
            //加载扩展清单文件(extension manifest file) vendor/yiisoft/extensions.php
            //在里面可以看到需要的扩展依赖配置
            //例如yii2-codeception yii2-redis yii2-mongodb yii2-faker
            $file = Yii::getAlias('@vendor/yiisoft/extensions.php');
            $this->extensions = is_file($file) ? include($file) : [];
        }
        foreach ($this->extensions as $extension) {
            if (!empty($extension['alias'])) {
                foreach ($extension['alias'] as $name => $path) {
                    Yii::setAlias($name, $path);
                }
            }
            //创建并运行各个扩展声明的 引导组件(bootstrap components)。
            if (isset($extension['bootstrap'])) {
                $component = Yii::createObject($extension['bootstrap']);
                if ($component instanceof BootstrapInterface) {
                    Yii::trace("Bootstrap with " . get_class($component) . '::bootstrap()', __METHOD__);
                    $component->bootstrap($this);
                } else {
                    Yii::trace("Bootstrap with " . get_class($component), __METHOD__);
                }
            }
        }
        //创建并运行各个应用组件以及在应用的Bootstrap属性中声明的modules组件
        //例如config/main.php中的'bootstrap' => ['log']
        //log 组件必须在 bootstrapping 期间就被加载，以便于它能够及时调度日志消息到目标里。
        foreach ($this->bootstrap as $class) {
            $component = null;
            if (is_string($class)) {
                if ($this->has($class)) {
                    $component = $this->get($class);
                } elseif ($this->hasModule($class)) {
                    $component = $this->getModule($class);
                } elseif (strpos($class, '\\') === false) {
                    throw new InvalidConfigException("Unknown bootstrapping component ID: $class");
                }
            }
            if (!isset($component)) {
                $component = Yii::createObject($class);
            }

            if ($component instanceof BootstrapInterface) {
                Yii::trace("Bootstrap with " . get_class($component) . '::bootstrap()', __METHOD__);
                $component->bootstrap($this);
            } else {
                Yii::trace("Bootstrap with " . get_class($component), __METHOD__);
            }
        }
    }

    {% endhighlight %}

----------------------------

## Routing

### URL Formats

* __the default URL format__ : `/index.php?r=post/view&id=100`

* __pretty URL format__      : `/index.php/post/100`

> To use the pretty URL format, you will need to design a set of URL rules according to the actual requirement about how the URLs should look like.

### Routing Process

__First Step__:

* The incoming request is parsed into a route and the associated query parameters.
  * When using the default URL format, parsing a request into a route is as simple as getting the value of a GET query parameter named r.
  * When using the pretty URL format, the URL manager will examine the registered URL rules to find matching one that can resolve the request into a route.


__Second Step__:

* A controller action corresponding to the parsed route is created to handle the request.


### Configure urlManager component

{% highlight php startinline %}
[
    'components' => [
        'urlManager' => [
            //switch between the two URL formats by toggling the enablePrettyUrl property
            'enablePrettyUrl' => true,
            //hide the entry script name(index.php) in the created URLs,
            'showScriptName' => false,
            //determines whether to enable strict request parsing
            'enableStrictParsing' => false,
            'rules' => [
                // ...
            ],
        ],
    ],
]
{% endhighlight %}
