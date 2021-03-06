---
layout: post
title:  "Yii2 Controller & Action"
date:   2015-8-2
categories: Yii
excerpt: how controller and action work in yii
---

* content
{:toc}

## Controller

Yii has three different controllers:

* base\Controller.php       the base class of other two

* console\Controller.php    console controller

* web\Controller.php        web controller

> yii中创建控制器是在application中的request通过UrlManager解析得出路由信息，然后再由yii\base\Module中的方法来创建控制器，最后由控制器再执行相应的动作.

{% highlight php startinline %}
    public function runAction($route, $params = [])
    {
        $parts = $this->createController($route);
        if (is_array($parts)) {
            /* @var $controller Controller */
            list($controller, $actionID) = $parts;
            $oldController = Yii::$app->controller;
            Yii::$app->controller = $controller;
            //调用yii/base/controller中的runAction方法，执行相应的action
            $result = $controller->runAction($actionID, $params);
            Yii::$app->controller = $oldController;

            return $result;
        } else {
            $id = $this->getUniqueId();
            throw new InvalidRouteException('Unable to resolve the request "' . ($id === '' ? $route : $id . '/' . $route) . '".');
        }
    }
{% endhighlight %}

Yii中的路由分三种情况：

* 第一种是带有模块的(module id/controller id/action id)，
* 第二种是带有命名空间（子目录）的（sub dir）/controller id/action id)
* 第三种是只有控制器和动作的(controller id/action id)

这三个有优先顺序，所以在创建控制器的时候，也是先查看是否是模块类型的路由，如果是，则获取这个模块，再由这个模块来创建控制器
接着再判断是否是第二种带有命名空间的。

> contoller创建参见 yii/base/module中的createController和createControllerByID方法

 --------------------------------

## Action

### Functions related to action in `yii\base\Controller.php`

**Sequence**: **resolve route** ---> **run action** ---> **create action**

> Runs a request specified in terms of a route.

{% highlight php startinline %}
// route值可以为当前controller中的action id,
// 或module id/controller id/action id/这种格式
// 如果以“/”开头，将用application来处理，否则，用module来处理
public function run($route, $params = [])
{
        $pos = strpos($route, '/');
        if ($pos === false) {
            //如果没有“/”，则为action id，直接调用runAction来执行这个action。如：index
            return $this->runAction($route, $params);
        } elseif ($pos > 0) {
            //如果“/”在中间，由当前的module来处理这个route。如：product/index
            return $this->module->runAction($route, $params);
        } else {
            //如果以“/”开头，则用当前的application来处理这个route。如：/product/index;
            return Yii::$app->runAction(ltrim($route, '/'), $params);
        }
}
{% endhighlight %}

> Runs an action within this controller with the specified action ID and parameters.

{% highlight php startinline %}
public function runAction($id, $params = [])
    {
        $action = $this->createAction($id);
        if ($action === null) {
            throw new InvalidRouteException('Unable to resolve the request: ' . $this->getUniqueId() . '/' . $id);
        }

        Yii::trace("Route to run: " . $action->getUniqueId(), __METHOD__);

        if (Yii::$app->requestedAction === null) {
            Yii::$app->requestedAction = $action;
        }

        $oldAction = $this->action;
        $this->action = $action;

        //用来保存当前控制器的所有父模块，顺序为由子模块到父模块
        $modules = [];
        $runAction = true;
        //获取当前控制器的所有的模块，并执行每个模块的beforeAction来检查当前的action是否可以执行
        //this->getModules()返回的数组顺序是从父模块到子模块，
        //所以beforeAction先从父模块检查，而afterAction正好相反.
        // call beforeAction on modules
        foreach ($this->getModules() as $module) {
            if ($module->beforeAction($action)) {
                array_unshift($modules, $module);
            } else {
                $runAction = false;
                break;
            }
        }

        $result = null;
        //如果所有的父模块都满足执行的条件
        if ($runAction && $this->beforeAction($action)) {
            // run the action
            //再判断当前控制器中是beforeAction，
            //最后由生成的action对象来执行runWithParams方法
            // 执行完后，再foreach执行afterAction方法
            $result = $action->runWithParams($params);

            $result = $this->afterAction($action, $result);

            // call afterAction on modules
            foreach ($modules as $module) {
                /* @var $module Module */
                $result = $module->afterAction($action, $result);
            }
        }

        $this->action = $oldAction;

        return $result;
    }
{% endhighlight %}

> Creates an action based on the given action ID.

{% highlight php startinline %}
    public function createAction($id)
    {
        if ($id === '') {
            $id = $this->defaultAction;
        }
        $actionMap = $this->actions();
        //如果在actions方法中指定了Standalone Actions，则直接使用此动作
        if (isset($actionMap[$id])) {
            return Yii::createObject($actionMap[$id], [$id, $this]);
        } elseif (preg_match('/^[a-z0-9\\-_]+$/', $id) && strpos($id, '--') === false && trim($id, '-') === $id) {
            $methodName = 'action' . str_replace(' ', '', ucwords(implode(' ', explode('-', $id))));
            if (method_exists($this, $methodName)) {
                //如果当前控制器中存在这个actionXXX方法，
                //再通过反射生成方法，再次检查一遍，最后生成InlineAction
                $method = new \ReflectionMethod($this, $methodName);
                if ($method->isPublic() && $method->getName() === $methodName) {
                    return new InlineAction($id, $this, $methodName);
                }
            }
        }
        return null;
    }
{% endhighlight %}

### Standalone Actions

There are two ways to create a action:

* inline actions  :
    * An inline action is defined as a method in the controller class.
* standalone actions :
    * A standalone action is a class extending yii\base\Action or its child classes.

由createAction可知，当controller在创建action的时候，会根据动作ID先在Standalone Actions中的$actionMap数组里面查找，如果找到则返回这个动作。所以这里定义的动作的优先级要大于在控制器里面定义的actionXXX函数。

> Binds the parameters to the action.

{% highlight php startinline %}
//比如定义了动作 actionCrate($id,$name=null)
//那个这个函数的作用就是从params(一般为$_GET)中提取$id，$name,
//具体的实现在web\Controller.php和console\Controller.php中
public function bindActionParams($action, $params)
{
    return [];
}
{% endhighlight %}

----------------------

## Web Controller  `Yii/web/controller`

web controller 继承自 base controller.

> Binds the parameters to the action.

{% highlight php %}
//此方法是base/controller中bindActionParams方法的实现
public function bindActionParams($action, $params)
    {
        //先通过反射得到动作action的方法信息
        //判断是Inline Action还是Standalone Action
        if ($action instanceof InlineAction) {
            $method = new \ReflectionMethod($this, $action->actionMethod);
        } else {
            $method = new \ReflectionMethod($action, 'run');
        }

        $args = [];
        $missing = [];
        $actionParams = [];
        foreach ($method->getParameters() as $param) {
            //获取action中形参的名字
            $name = $param->getName();
            //判断形参和$_GET中的参数是否匹配
            if (array_key_exists($name, $params)) {
                //先判断形参的数据结构，如果是数组，再进一步判断实参
                if ($param->isArray()) {
                    //如果$_GET中的实参也为数组，直接返回值，否则把实参包装成数组
                    $args[] = $actionParams[$name] = is_array($params[$name]) ? $params[$name] : [$params[$name]];
                } elseif (!is_array($params[$name])) {
                    //如果$_GET中的实参不是数组，则直接返回值
                    $args[] = $actionParams[$name] = $params[$name];
                } else {
                    throw new BadRequestHttpException(Yii::t('yii', 'Invalid data received for parameter "{param}".', [
                        'param' => $name,
                    ]));
                }
                unset($params[$name]);
            } elseif ($param->isDefaultValueAvailable()) {
                //如果在$_GET中没有找到实参,则先判断形参是否有默认值
                $args[] = $actionParams[$name] = $param->getDefaultValue();
            } else {
                //action中定义的形参没有在$_GET中找到
                $missing[] = $name;
            }
        }

        //action中的参数有缺少，抛异常
        if (!empty($missing)) {
            throw new BadRequestHttpException(Yii::t('yii', 'Missing required parameters: {params}', [
                'params' => implode(', ', $missing),
            ]));
        }

        $this->actionParams = $actionParams;

        return $args;
    }
{% endhighlight %}

> ###  Response in web controller

* public function redirect($url, $statusCode = 302)

    > Url::to()会对传入的url参数进行处理

     * a string representing a URL (e.g. "http://example.com")
     * a string representing a URL alias (e.g. "@example.com")
     * an array in the format of `[$route, ...name-value pairs...]` (e.g. `['site/index', 'ref' => 1]`)
* public function goHome()
* public function goBack($defaultUrl = null)
* public function refresh($anchor = '')

