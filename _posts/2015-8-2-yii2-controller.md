---
layout: post
title:  "Yii2 Controller & Action"
date:   2015-8-2
categories: Yii
excerpt: how controller and action work in yii
---

* content
{:toc}

### Controller

Yii has three different controllers:

* base\Controller.php       the base class of other two

* console\Controller.php    console controller

* web\Controller.php        web controller

### Functions related to action in `yii\base\Controller.php`

**Sequence**: **resolve route** ---> **run action** ---> **create action**

> Runs a request specified in terms of a route.

{% highlight php startinline %}
public function run($route, $params = [])
{
        $pos = strpos($route, '/');
        if ($pos === false) {
            return $this->runAction($route, $params);
        } elseif ($pos > 0) {
            return $this->module->runAction($route, $params);
        } else {
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
        //如果所以的父模块都满足执行的条件
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
        //如果在actions方法中指定了独立的动作，则直接使用此动作
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