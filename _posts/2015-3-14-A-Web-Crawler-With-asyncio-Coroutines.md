---
layout: post
title:  "A Web Crawler With asyncio Coroutines"
date:   2016-03-14 10:22:00
categories: python
excerpt: The translation of A Web Crawler With asyncio Coroutines
---

* content
{:toc}

# 文章介绍

这篇关于python crawler的文章被收录在[500 Lines or Less](http://aosabook.org/en/500L/a-web-crawler-with-asyncio-coroutines.html)中,来自于[Architecture of Open Source Applications](http://aosabook.org/en/index.html)系列丛书的第四本.

- 文章名: A Web Crawler With asyncio Coroutines
- 作者: A. Jesse Jiryu Davis and Guido van Rossum

>> 作者介绍:

        A. Jesse Jiryu Davis is a staff engineer at MongoDB in New York. He wrote Motor, the async MongoDB Python driver, and he is the lead developer of the MongoDB C Driver and a member of the PyMongo team. He contributes to asyncio and Tornado.

        Guido van Rossum is the creator of Python, one of the major programming languages on and off the web. The Python community refers to him as the BDFL (Benevolent Dictator For Life), a title straight from a Monty Python skit.


# 正文翻译

## 介绍(Introduction)

经典的计算机科学看重那些完成计算过程尽可能快的有效算法.但是大多数与网络相关的程序运行所花的时间并不是在计算上,而是用在持续地打开许多缓慢,IO事件稀少的网络连接.这些程序向我们提出了这样的挑战,计算机需要去高效地等待大量网络IO事件.当下,一个较为有效并且普遍的方法是通过异步IO,或者简称为"async".

本篇文章会向大家呈现一个简单的网络爬虫程序,这个爬虫程序会等待大量的消息响应,但是只需要做很少量的计算,所以可以将他看做一个异步应用的原型.异步的爬虫意味着它一次性抓取越多的页面,程序完成的时间就好越早.如果程序为每一个接受的请求打开一个线程,那么当出现大量并发请求的时候,程序在完成socket数据交换之前就已经耗尽了内存或是其他与线程相关的资源.而异步IO可以很好地解决程序对线程的需求.在后面的文章中,我们会通过设立三个场景来举例子.第一个场景中,我们会展示一个异步的事件循环(event loop),然后通过这个搭配回调的event loop来简单实现一个爬虫.这段简单的代码很高效,但是如果需要扩展这个程序去解决更复杂的问题的话,那我们的代码将会变得乱七八糟.所以在第二个场景中,我们会展示python实现的协程模型的高效性和可扩展性.我们将会通过python中的生成器函数(generator)实现简单的协程模型.而在最后第三个场景中,我们将使用python标准库中的"asyncio"模块,通过他提供的功能完善的协程模型并结合异步队列来改善我们的爬虫程序.

## 任务(Task)

一个网络爬虫通常会在一个站点下查找并下载所有网页,然后进一步对内容归档或索引.爬虫会从一个根URL路径开始抓取每一个页面,通过解析URL链接的路径来判断是否重复,然后将新的链接地址加入到队列中.当爬虫抓到的页面没有新的链接并且链接队列为空时,爬虫就会停止.

我们能通过并行地下载大量的页面来加速爬虫工作的速度.当爬虫发现新的链接时,它会同时在另一个独立的socket通道中对新页面得开始抓取操作.当对新网页请求的响应一返回,爬虫就会解析响应并将新的链接加入到队列中.当太多的并发请求导致性能下降时,请求返回的速度可能会递减式地降低,
所以我们不得不限制并发请求的数量并丢下队列中剩下的需要请求的链接,直到正在等待回应的链接完成数据传输.

## 传统的解决方法

如何才能使我们的爬虫并行化地工作?通常情况下,我们会生成一个线程池,每一个线程在一个socket通道中会负责串行地下载页面.举个例子,从xkcd.com下载一个页面:

    def fetch(url):
    sock = socket.socket()
    sock.connect(('xkcd.com', 80))
    request = 'GET {} HTTP/1.0\r\nHost: xkcd.com\r\n\r\n'.format(url)
    sock.send(request.encode('ascii'))
    response = b''
    chunk = sock.recv(4096)
    while chunk:
        response += chunk
        chunk = sock.recv(4096)

    # Page is now downloaded.
    links = parse_links(response)
    q.add(links)

在默认情况下,socket操作是阻塞的,阻塞意味着当一个线程调用类似于connect或recv的方法时,程序会停止直到这个操作完成.因此如果需要一次性下载大量的页面,程序需要大量的线程资源.这个程序通过线程池维持闲置的线程来分摊新建线程的代价,然后不断地重复利用线程完成后续的任务.这种做法的原理和在连接池中保存sockets实例如出一辙.

然而,线程的代价是昂贵的,并且操作系统严格限制了一个进程,用户或机器的所能拥有的最大线程数量.在作者Jesse的系统中,一个python产生的线程需要50kb的内存空间,数以万计的线程同时工作会导致计算机崩溃.当并行的sockets通道中扩容到数以万计的操作时,线程资源显然不够用,所以当线程资源的需求超过了操作系统限制时,程序就遇到了瓶颈.

Dan Kegel曾在"The C10K problem"这篇中提到了多线程在并行IO中遇到的瓶颈:

>  It's time for web servers to handle ten thousand clients simultaneously, don't you think? After all, the web is a big place now.

Kegel在1999年创造了"C10K"这个术语,上万的连接在现在听起来很简单,但这只是数量发生了变化,问题本质并未改变.回到过去,每一个连接对应一个线程对于C10K是不切实际的,现在的情况只是数量级更高了.实际上,多线程方案对于我们编写的玩具爬虫程序已经够用了,然而对于海量规模的应用,面对百万级的连接,瓶颈依然存在:大多数操作系统能创建更多的sockets对象,但是对应的线程资源不够使用.我们如何才能解决这个问题呢?

## 异步

异步IO的框架能够在一个单独的线程上完成并行的操作,让我们来理解它的原理.

异步框架和模型使用非阻塞的sockets.在我们的异步爬虫程序中,我们在连接服务器之前将socket设置成非阻塞.

    sock = socket.socket()
    sock.setblocking(False)
    try:
        sock.connect(('xkcd.com', 80))
    except BlockingIOError:
        pass

麻烦的是不管connect方法是否正常执行时,非阻塞的socket对象都会抛出异常.这个异常来自底层实现的C函数,通过将errno设置成EINPROGRESS来通知你连接已经建立.

现在爬虫程序需要一个方法知道连接何时被建立,这样它才能有效地发送HTTP请求.我们可以简单地通过循环不断地发送请求:

    request = 'GET {} HTTP/1.0\r\nHost: xkcd.com\r\n\r\n'.format(url)
    encoded = request.encode('ascii')

    while True:
        try:
            sock.send(encoded)
            break  # Done.
        except OSError as e:
            pass

    print('sent')

这个方法不仅浪费电能而且不能高效得在多sockets条件下等待事件.在以前,BSD Unix下的解决方案是select方法,这个由C语言实现的方法能够等待响应一个或多个sockets中发生的事件.现今需要处理海量连接的网络应用促使将select方法替换成poll或类似的方法,然后是BSD中的kqueue和linux下的epoll方法.这些借口方法都类似于select,但是应对大量连接请求时的性能更好.

python-3.4版本中的DefaultSelector模块通过操作系统实现了一个性能最好的类似select的方法.爬虫程序可以通过新建一个非阻塞的socket并注册一个默认的selector来达到注册网络IO事件通知的目的.

    from selectors import DefaultSelector, EVENT_WRITE

    selector = DefaultSelector()

    sock = socket.socket()
    sock.setblocking(False)
    try:
        sock.connect(('xkcd.com', 80))
    except BlockingIOError:
        pass

    def connected():
        selector.unregister(sock.fileno())
        print('connected!')

    selector.register(sock.fileno(), EVENT_WRITE, connected)




