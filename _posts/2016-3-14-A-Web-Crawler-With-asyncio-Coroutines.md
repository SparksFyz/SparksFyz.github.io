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

> 作者介绍:

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

上面的代码中我们忽视了一个假的错误并调用了selector.register方法,这个方法会通过在socket文件描述符中传递的一个常量知道需要等待哪个事件.如果想要在连接建立的时候被通知,只需要传递EVENT_WRITE常量,意思是程序想知道什么socket处于可写状态.方法参数中还传递了一个函数connected,这个函数将会在事件发生时被调用.这样的函数被称作回调函数.

当循环中的selector接收到事件时,程序会生成IO通知:

    def loop():
        while True:
            events = selector.select()
            for event_key, event_mask in events:
                callback = event_key.data
                callback()

connected回调函数被存储在event_key.data变量中,非阻塞socket通道连接成功时,这个回调就会被执行.和第一个版本不同,selector对象在循环调用select方法时,程序会停止,等待下一个IO事件.然后内循环会调用事件回调函数.

到现在为止我们证明了什么?代码展示了如何开始一个IO操作然后当监听事件发生时调用回调函数.其实这就是异步框架中两个特性--非阻塞和事件循环,这就是如何在单线程中进行并发操作的方案.

程序已经实现并发操作,但这并不是传统意义上的并行.并行指的是一个系统同时执行多个IO操作.利用多核同时并行计算是不现实的,但是这个程序是解决IO密集型问题而非cpu密集型问题.

所以我们程序中的事件循环高效的原因是程序没有给每一个连接线程资源,但是在这里必须先纠正这样的误解:异步一定比多线程快.实际上在python中,大多数情况下,多线程要更快一些,时间循环在只有少量活跃连接的情况下速度较慢.在没有全局解释器锁的运行环境中,线程在这样的工作流上表现更好.异步IO更适用于那些维持大量缓慢或休眠状态有少量事件的连接的应用.

## 回调编程

我们已经编写了一个短小的异步框架,但如何编写一个网络爬虫呢?我们可以定义全局的集合用来保存已抓取和待抓取的url,seen_urls集合保存已经抓取的url和还未抓取的部分:

    urls_todo = set(['/'])
    seen_urls = set(['/'])

抓取一个页面需要一系列的回调函数.connected回调当一个socket连接建立时触发,然后给服务器发送一个GET请求.然后它需要等待响应,所以也就需要注册一个新的回调.我们可以把这些回调集中在Fetcher对象中.它需要一个URL,一个socket对象,一个积攒响应值的变量:

    class Fetcher:
        def __init__(self, url):
            self.response = b''  # Empty array of bytes.
            self.url = url
            self.sock = None

    # Method on Fetcher class.
    def fetch(self):
        self.sock = socket.socket()
        self.sock.setblocking(False)
        try:
            self.sock.connect(('xkcd.com', 80))
        except BlockingIOError:
            pass

        # Register next callback.
        selector.register(self.sock.fileno(),
                          EVENT_WRITE,
                          self.connected)

fetch方法中先去连接一个socket,但是注意这个方法在连接被建立之前就返回了.它必须将控制权交回事件循环去等待新的连接.我们可以这样想象整个应用的架构:

    # Begin fetching http://xkcd.com/353/
    fetcher = Fetcher('/353/')
    fetcher.fetch()

    while True:
        events = selector.select()
        for event_key, event_mask in events:
            callback = event_key.data
            callback(event_key, event_mask)

所有事件触发的通知会在调用select方法时产生,因此fetch方法必须把程序的掌控权交给事件循环,这样程序才能知道socket通道何时被建立.同时内层循环才能运行在fetch函数内注册的回调函数connected.下面是回调函数connected的实现:

        # Method on Fetcher class.
        def connected(self, key, mask):
            print('connected!')
            selector.unregister(key.fd)
            request = 'GET {} HTTP/1.0\r\nHost: xkcd.com\r\n\r\n'.format(self.url)
            self.sock.send(request.encode('ascii'))

            # Register the next callback.
            selector.register(key.fd,
                              EVENT_READ,
                              self.read_response)

回调函数发送了一个GET请求.一个真正的网络应用会检查send请求的返回值,防止出现消息不是一次整条传送回来的情况.但是这里我们的应用非常简单并且请求返回也很小,所以无需在意.当然,回调函数中必须注册另一个回调然后把控制权交还给事件循环.新的回调函数read_response会负责处理服务器的返回.

    # Method on Fetcher class.
    def read_response(self, key, mask):
        global stopped

        chunk = self.sock.recv(4096)  # 4k chunk size.
        if chunk:
            self.response += chunk
        else:
            selector.unregister(key.fd)  # Done reading.
            links = self.parse_links()

            # Python set-logic:
            for link in links.difference(seen_urls):
                urls_todo.add(link)
                Fetcher(link).fetch()  # <- New Fetcher.

            seen_urls.update(links)
            urls_todo.remove(self.url)
            if not urls_todo:
                stopped = True

这个回调函数会在每次selector发现socket处于可写状态下被调用,可写状态表示socket对象中有数据或者已被关闭.

回调函数中首先会从socket读取4KB的数据.如果数据不足4KB,chunk会存储任何有效的数据.如果可读的数据更多,socket可读并且chunk中装满了4B的数据,那么事件循环会立刻再次触发回调.当请求的响应返回完毕并且chunk中剩余的数据被处理完毕,服务器就会关闭socket.
代码中没有展示出来的parse_links方法,会返回一个URLs的集合.在没有并发要求的情况下,程序可以给每一个新的URL生成新的fetcher实例.我们可以注意到利用回调的异步编程有一个不错的功能:程序在改变共享数据时不需要互斥锁,例如在给seen\_urls集合增加新连接.任何一个操作任务都不会在任意一行代码被打断,因为没有会抢先运行的任务.

这里我们再增加一个全局的stopped变量并利用它来控制循环:

    stopped = False

    def loop():
        while not stopped:
            events = selector.select()
            for event_key, event_mask in events:
                callback = event_key.data
                callback()

一旦多有页面下载完成,fetcher就会停止外层的事件循环,程序也因此退出.上面的例子清晰的表现了异步编程的问题:代码显得很乱,可读性很差.我们需要一些方法使程序能够表达一系列计算和IO操作,并能够并行地调度这些工作.但是在没有多线程的情况下,这一系列操作无法同时在一个方法中执行,因为不论何时一个方法开始IO操作,它都会明确地将未来需要的状态保存下来,然后直接返回.你需要认真思考如何编写有状态的代码.

通过代码可以解释一下上面的原理.思考如何简单地通过单线程在传统的阻塞socket抓取一个URL:

    # Blocking version.
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

这个方法会在一个socket连接和下一个之间记住什么样的状态?这个方法中包含了socket对象,URL和累加存储响应返回的response变量.这样的方法在单线程中运行时会通过编程语言在暂时的状态保存在栈里的临时变量中,并且它有延续性的机制:程序能够在完成IO操作后继续执行.程序运行的环境通过保存线程中指令的指针来实现这种延续性,这样的机制在编程语言被实现.

但是对于异步回调的框架来说,这样的编程语言提供的功能没有用处.当在等待IO的过程中,执行的方法必须显式地保存状态,因为调用方法在IO完成之前就会返回并丢失栈中的数据帧.在存储临时变量的地方,示例代码运行时会将sock和response保存在self中,即Fetcher实例.在存储指令指针的地方则会通过注册回调函数来保存程序的上下文.当应用的功能变多时,我们通过回调需要保存的状态的复杂性也会提高.如此麻烦的保存记录会给编译器带来很多问题.更麻烦的是,在回调链中当一个回调准备调用下一个回调函数之前抛出异常,这种情况会发生什么事?可以看一下parse_link方法在解析HTML时抛出异常的示例:

    Traceback (most recent call last):
      File "loop-with-callbacks.py", line 111, in <module>
        loop()
      File "loop-with-callbacks.py", line 106, in loop
        callback(event_key, event_mask)
      File "loop-with-callbacks.py", line 51, in read_response
        links = self.parse_links()
      File "loop-with-callbacks.py", line 67, in parse_links
        raise Exception('parse error')
    Exception: parse error

堆栈记录展示了事件循环在调用一个回调函数,但我们并不记得导致错误的原因,问题在程序的两端都出现了,我们记不得程序的上一步在哪也不知道下一步要执行什么.上下文的丢失被称作"堆栈断裂",在大多数情况下这个现象使程序员找不到方向.堆栈信息断裂使我们难以对一系列的回调做异常处理.

## 协程

在这里我希望读者能继续阅读下去,因为解决上面的一系列问题并非不可能.异步编程有方法将回调的高效与多线程编程高可读性结合起来,这种结合可以通过"协程"模式实现.在python-3.4标准库中通过使用asyncio模块和"aiohttp"包能够更直接地抓取URL:

    @asyncio.coroutine
    def fetch(self, url):
        response = yield from self.session.get(url)
        body = yield from response.read()

这种方法也是能够应对扩容的,和每个线程占用50k内存和操作系统对线程的严格限制相比,一个python协程仅仅占用系统3k的内存.python能够轻松运行数十万协程.

协程的理念需要在计算机科学领域可以追溯很远,原理很简单:协程可以被看做能够停止和恢复的子程序.与线程被操作系统用来完成多任务相比,协程通过合作协同来实现多任务:协程能选择何时中断,何时继续运行下一步.

协程模式有很多种实现方式,甚至在python中就有好几种.在"asyncio"标准库的协程模型是基于生成器,Future类和yield from语句实现的.从python-3.5开始,协程会成为语言的内置特性.当然,理解协程在3.4版本的实现原理是使用3.5版本内置特性的基础.

为了解释python-3.4中基于生成器的协程模型,我们会先介绍在asyncio模块中使如何使用生成器的,并将其使用在我们的爬虫程序中.

## python生成器如何工作

在理解python生成器之前,我们需要知道常规的python函数是如何工作的.通常,当一个python函数调用子程序时,子程序直到返回时才交还控制权或者抛出异常.

    >>> def foo():
    ...     bar()
    ...
    >>> def bar():
    ...     pass

标准python解释器是用C语言实现的,C语言执行被调用的python函数的方法就做PyEval_EvalFrameEx.它会携带一个python的栈帧对象然后计算保存在帧中的字节码.下面展示了foo函数的字节码:

    >>> import dis
    >>> dis.dis(foo)
      2           0 LOAD_GLOBAL              0 (bar)
                  3 CALL_FUNCTION            0 (0 positional, 0 keyword pair)
                  6 POP_TOP
                  7 LOAD_CONST               0 (None)
                 10 RETURN_VALUE

foo函数将bar函数加载到栈中并调用它,然后从栈中弹出返回值,将None压入栈也会返回None.当PyEval_EvalFrameEx遇到CALL\_FUNCTION这样的字节码,它会生成一个新的栈帧然后递归重复之前的步骤.

理解python栈帧在堆内存如何分配非常关键.python解释器是一个常规的C程序,所以它的栈帧是C中普通的栈帧.但是C控制的python栈帧是存储在堆上的.对然伴随一些惊讶,这种情况意味着python栈帧的生命周期要比本身的函数要长.我们可以通过在bar函数内保存当前的帧来深入查看.

    >>> import inspect
    >>> frame = None
    >>> def foo():
    ...     bar()
    ...
    >>> def bar():
    ...     global frame
    ...     frame = inspect.currentframe()
    ...
    >>> foo()
    >>> # The frame was executing the code for 'bar'.
    >>> frame.f_code.co_name
    'bar'
    >>> # Its back pointer refers to the frame for 'foo'.
    >>> caller_frame = frame.f_back
    >>> caller_frame.f_code.co_name
    'foo'

下面这段代码展示了python生成器,运用了相同代码块对象和栈帧,但是起到了惊人的效果:

    >>> def gen_fn():
    ...     result = yield 1
    ...     print('result of yield: {}'.format(result))
    ...     result2 = yield 2
    ...     print('result of 2nd yield: {}'.format(result2))
    ...     return 'done'
    ...

当python将gen_fn函数编译成字节码时,编译器发现了yield语句,于是知道了gen\_fn是一个生成器函数,通过设立一个标志去记录这个函数:

    >>> # The generator flag is bit position 5.
    >>> generator_bit = 1 << 5
    >>> bool(gen_fn.__code__.co_flags & generator_bit)
    True

当程序调用一个生成器函数,python看到生成器标志,他就会新建一个生成器实例而不是简单地运行这个函数:

    >>> gen = gen_fn()
    >>> type(gen)
    <class 'generator'>

python生成器将一个栈帧加上引用然后压缩入其他代码中,下面是gen_fn的函数体:

    >>> gen.gi_code.co_name
    'gen_fn'

所有通过调用gen_fn新建的生成器实例都会指向相同的代码.但是每一个实例都会拥有自己的栈帧.这些栈帧不会存储在任何形式的栈中,而是被放在堆内存中等待被使用.

在帧中有个叫做着"最近被执行的指令"的指针,代表最近一条执行的指令.在开始的时候,这个指针的值为-1,代表生成器还没有开始执行:

    >>> gen.gi_frame.f_lasti
    -1

当调用send函数时,生成器会执行到第一个yield语句然后停止.send函数的返回值为1,因为1是由gen变量传给yield表达式的:

    >>> gen.send(None)
    1

执行到这里,生成器指令的指针已经跳过了3个字节码,当然这只是编译后56字节的一部分:

    >>> gen.gi_frame.f_lasti
    3
    >>> len(gen.gi_code.co_code)
    56

生成器可以在任何时候从任何函数中恢复执行,因为它的栈帧并没有存储在栈中而是在堆中.它在调用优先级中的位置并不是固定的,并且它也不需要遵守正常函数先进后出的执行顺序.它是很自由的,就像自由漂浮的云一样.

我们可以通过send函数将"hello"字符串传入生成器,然后字符串就会成为yield表达式的结果,生成器会继续执行直到执行完yield 2:

    >>> gen.send('hello')
    result of yield: hello
    2

这段代码的栈帧现在包含了临时变量result:

    >>> gen.gi_frame.f_locals
    {'result': 'hello'}

其他从gen_fn产生的生成器实例拥有属于自己的栈帧和临时变量.当程序再次调用send函数时,生成器会再一次运行yield语句,最后伴随着引起StopIteration异常而结束;

    >>> gen.send('goodbye')
    result of 2nd yield: goodbye
    Traceback (most recent call last):
      File "<input>", line 1, in <module>
    StopIteration: done

这个异常有一个值,其实就是生成器函数的返回值,字符串"done".

## 用生成器编写一个协程模型









