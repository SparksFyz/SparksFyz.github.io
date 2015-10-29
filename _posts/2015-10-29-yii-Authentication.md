---
layout: post
title:  "Yii2 Authentication"
date:   2015-10-29
categories: Yii
excerpt: Yii2 Authentication
---

* content
{:toc}

## Authentication

> Yii provides an authentication framework which wires up various components to support login.

To use this framework, just follow this two steps:

* Configure the user application component;
* Create a class that implements the yii\web\IdentityInterface interface.

### Configuring `yii\web\User`

> user是yii自带的component, 可以用来管理用户的认证状态.

在config下的 __User__ 数组中指定一个`identityClass`

{% highlight php %}
return [
    //......
    //......
    'components' => [
        'user' => [
            'identityClass' => 'app\models\User',
            //如果开启自动登录yii\web\User::enableAutoLogin,
            //则基于cookie登录,它将使用cookie保存用户身份，这样只要cookie有效就可以恢复登录状态。
            'enableAutoLogin' => true,
            //同理，enableSession
        ],
    ],
];
{% endhighlight %}

--------------------

### Implementing `yii\web\IdentityInterface`

> 根据应用的具体的需要来实现接口中方法

* findIdentity()
  * 根据指定的用户ID查找identityClass实例，当使用session来维持登录状态的时候会用到这个方法
* findIdentityByAccessToken()
  * 根据指定的存取令牌查找identityClass实例，该方法用于通过单个加密令牌认证用户的时候（比如无状态的RESTful应用）
* getId()
  * 获取该认证实例表示的用户的ID
* getAuthKey()
  * 获取基于cookie登录时使用的认证密钥(在config进行配置)
  * 认证密钥储存在cookie里并且将来会与服务端的版本进行比较以确保cookie的有效性。
* validateAuthKey()
  * 是基于cookie登录密钥验证的逻辑的实现

> 例如，你的项目只是一个无状态的RESTful应用，只需实现findIdentityByAccessToken()和getId()方法login

### Authentication Events

* `EVENT_BEFORE_LOGIN`
* `EVENT_AFTER_LOGIN`
* `EVENT_BEFORE_LOGOUT`
* `EVENT_AFTER_LOGOUT`