---
layout: post
title:  "Yii2 Request Handler"
date:   2015-10-23
categories: Yii
excerpt: Request Handler and Route in Yii2
---

* content
{:toc}

### URL Formats

* __the default URL format__ : `/index.php?r=post/view&id=100`

* __pretty URL format__      : `/index.php/post/100`

> To use the pretty URL format, you will need to design a set of URL rules according to the actual requirement about how the URLs should look like.

### Routing

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
            'showScriptName' => false,
            'enableStrictParsing' => false,
            'rules' => [
                // ...
            ],
        ],
    ],
]
{% endhighlight %}
