---
layout: post
title:  "Django Websocket"
date:   2016-1-22
categories: Django
excerpt: Django-Websocket
---

### Websocket

__From Wikipedia__

Websocket is a protocol for full-duplex communication channels over a single TCP connection.

### Socket.IO
Socket.IO 是一个比较常用的javascript库,通过使用websocket等协议,提供了基于event的实时双向通信功能.通过前端的javascript库和nodejs实现的server就能实现通信.

### Python Django & Websocket

Python 在使用websocket的时候比较麻烦,主要会遇到两个问题

> Two Problems

- WSGI protocol can not support Websockets and it falls apart from the rest framework.
  - Due to workflow of request handling in Django, it can not support long term connections.

- Default python networked apps are not exactly designed for event-based communications.
  - So we need to use some event-based networking lib like [gevent](https://github.com/gevent/gevent)


### Four methods for websocket in Django

#### gevent-socketio

[github](https://github.com/abourget/gevent-socketio)

gevent 大致是一个基于协程的python网络库, 它的编程模型和类似于nodejs, 在server端能提供一些类似的功能, 例如:

- event loop机制
- Cooperative sockets with SSL support
- Lightweight execution units based on greenlet

gevent-socketio 用python版的socketio实现,包括django等一些基于wsgi的框架都能使用.

> 这个库的优点就是只需要依赖gevent,实现了socket.io/Node.js中的大多数功能, 但是源码大概两年没更新维护了,Django只支持到1.4, 我在使用的过程中发现问题较多, 所以不推荐用.


### Django-Websocket-Redis

[docs](http://django-websocket-redis.readthedocs.org/en/latest/introduction.html)
[github](https://github.com/jrief/django-websocket-redis)

这个module支持的功能较多,主要使用了uwsgi和redis:

- uWSGI实现了wsgi协议,并且支持websocket,能够和基于wsgi的框架通信.
- 用redis来作为消息队列
- 也使用了gevent来实现event loop

> 我跑了一下demo,除了configuration可能麻烦一点之外,与gevent-socketio相比优点比较明显:

- 仍然有人在不断得维护更新,最新的版本支持到了python-3.4和django-1.8.
- 扩展性比较好,application支持的连接数很大.

__hint__: 具体的demo例子, 可以另开一篇介绍.


### SwampDragon

[github](https://github.com/jonashagstedt/swampdragon)

这个module我还没有用过, 看了一下介绍,也是一个为了在django中构建real-time web applications的module,
和上面两个module类似,它依赖的库比较多,但主要还是使用tornado这个实现异步的网络库,同时也使用redis消息队列.

- 这个module可能因为专门为Django写的,所以利用了django中很好的功能,在现有的django项目中不需要改变什么就能直接用.

- 另外我在它的features中看到, 这个模块support angularJS, 但具体有哪些, 等有空把玩一下再补充上来吧...


### dwebsocket

[github](https://github.com/duanhongyi/dwebsocket)

这个是我前几天使用的module,该作者并非原作者,只是在原作者的基础上更新了实现的websocket协议版本.

这个module只是提供了websocket协议在django中的实现,也使用了eventlet(和gevent类似的networking lib),所以提供的功能较少, 只能提供基本的通信和一些简单事件处理方法,不过能满足基本的需求了,使用起来也比较简单.

#### 举个栗子

- frontend

{% highlight js %}
    var s = new WebSocket("ws://127.0.0.1:8000/xxxx"); // setup a websocket connection

    // callback
    s.onopen = function () {
            console.log('WebSocket open');
    };
    s.onmessage = function (e) {
          console.log(e.data);
    };
    setTimeout(function() {
        s.send("action");
    }, 2000);
    s.onclose = function (e) {
        setTimeout(function() {
            alert("close");
        }, 4000);
    }
{% endhighlight %}

- backend

{% highlight python %}
  from django.http import HttpResponse
  from dwebsocket import accept_websocket

  # module中提供的decorator, 可以使这个handler既能接收普通的http get请求,又能接收websocket
  @accept_websocket
  def xxxx(request):
      if not request.is_websocket():
          message = request.GET['message']
          return HttpResponse(message)
      else:
          # request.websocket是一个封装了请求信息和client信息的object,
          # 同时在这个object上提供了一些方法,例如wait(), send(),read()等等.
          for message in request.websocket:
              request.websocket.send(message)
{% endhighlight %}







