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

一个生成器既然可以停止,那么也可以通过一个值来恢复,并且生成器也有返回值.这样看起来生成器模型就像一个简单的但可读性极好的异步编程模型.我们想要实现一个这样的协程:子程序之间可以在程序中融洽地被调度.我们使用的协程模型将是"asyncio"标准库提供模型的简化版本.当我们使用asyncio时,程序需要使用生成器,future类以及yield from语句.

首先我们需要找一个方法提供协程等待的未来的结果.下面是一个简化的版本:

    class Future:
        def __init__(self):
            self.result = None
            self._callbacks = []

        def add_done_callback(self, fn):
            self._callbacks.append(fn)

        def set_result(self, result):
            self.result = result
            for fn in self._callbacks:
                fn(self)

一个future实例在初始化时的值是待定的,直到set_result方法被调用.我们的爬虫程序将使用future类和协程.再看一下之前使用回调的版本:

    class Fetcher:
        def fetch(self):
            self.sock = socket.socket()
            self.sock.setblocking(False)
            try:
                self.sock.connect(('xkcd.com', 80))
            except BlockingIOError:
                pass
            selector.register(self.sock.fileno(),
                              EVENT_WRITE,
                              self.connected)

        def connected(self, key, mask):
            print('connected!')
            # And so on....

fetch方法首先会建立一个socket连接,然后注册回调函数connected,这个函数将会在建立完成时被调用.现在我们试一下将这两步结合入协程:

    def fetch(self):
        sock = socket.socket()
        sock.setblocking(False)
        try:
            sock.connect(('xkcd.com', 80))
        except BlockingIOError:
            pass

        f = Future()

        def on_connected():
            f.set_result(None)

        selector.register(sock.fileno(),
                          EVENT_WRITE,
                          on_connected)
        yield f
        selector.unregister(sock.fileno())
        print('connected!')

现在的fetch方法是一个生成器函数,和普通函数相比,它包含了yield语句.程序生成了一个未来的结果,然后通过yield将fetch函数中断知道连接完成后调用回调函数.回调函数将真正的值传回future实例.但是当接收到真正的值之后如何恢复生成器函数呢?我们需要一个协程驱动.我们可以称之为"任务(task)".

    class Task:
        def __init__(self, coro):
            self.coro = coro
            f = Future()
            f.set_result(None)
            self.step(f)

        def step(self, future):
            try:
                next_future = self.coro.send(future.result)
            except StopIteration:
                return

            next_future.add_done_callback(self.step)

    # Begin fetching http://xkcd.com/353/
    fetcher = Fetcher('/353/')
    Task(fetcher.fetch())

    loop()

在fetch方法最开始运行时task实例调用send函数将None传入.fetch函数会在调用yield语句后中段,这时候task实例能接收到yield传出的值.当socket连接完成时,事件循环会触发回调函数on_connected,使future实例接收到值,同时也会调用step方法,使fetch函数恢复运行.

## yield from 语句对协程的影响

当一个socket连接建立后,程序将发送HTTP请求然后处理服务器返回的结果.这些步骤不需要分散在回调函数之间.我们可以将这些代码编写在同一个生成器函数中:

    def fetch(self):
        # ... connection logic from above, then:
        sock.send(request.encode('ascii'))

        while True:
            f = Future()

            def on_readable():
                f.set_result(sock.recv(4096))

            selector.register(sock.fileno(),
                              EVENT_READ,
                              on_readable)
            chunk = yield f
            selector.unregister(sock.fileno())
            if chunk:
                self.response += chunk
            else:
                # Done reading.
                break

上面这段代码,将整个消息一下子从socket中读出,看上去节省了时间作用很大.我们如何将这些工作从fetch函数中抽出来交给子程序来负责呢?现在python3中提供的yield from语句起了作用,这个功能使生成器有了代理的功能.

    >>> def gen_fn():
    ...     result = yield 1
    ...     print('result of yield: {}'.format(result))
    ...     result2 = yield 2
    ...     print('result of 2nd yield: {}'.format(result2))
    ...     return 'done'
    ...

如果想要在另一个生成器中调用这个生成器,可以通过yield from:

    >>> # Generator function:
    >>> def caller_fn():
    ...     gen = gen_fn()
    ...     rv = yield from gen
    ...     print('return value of yield-from: {}'
    ...           .format(rv))
    ...
    >>> # Make a generator from the
    >>> # generator function.
    >>> caller = caller_fn()

caller这样的生成器函数就像之前的根函数一样,下面是负责代理的生成器函数:

    >>> caller.send(None)
    1
    >>> caller.gi_frame.f_lasti
    15
    >>> caller.send('hello')
    result of yield: hello
    2
    >>> caller.gi_frame.f_lasti  # Hasn't advanced.
    15
    >>> caller.send('goodbye')
    result of 2nd yield: goodbye
    return value of yield-from: done
    Traceback (most recent call last):
      File "<input>", line 1, in <module>
    StopIteration

在caller函数中当执行yield from语句时,caller会中断停止执行.注意函数的指令指针依旧是15,代表着yield from语句,从caller函数外面来,我们无法区分判断yield传出的值是从caller中来的还是从代理的生成器来的.并且从根函数中看,我们也没有办法区分值是从caller函数还是函数外部传入的.yield from语句就像一个光滑的通道,gen函数随着值在通道传入传出而结束.

一个协程能够将工作通过yield from交给子程序代理,然后只需要接收子程序返回的结果.注意之前的caller函数输出了yield from的返回值done.当gen函数完成时,它的返回值变成了yield from表达式的返回值.

在第二个场景中,我们批判基于回调函数的异步编程模型,最主要的原因是因为堆栈上下文丢失,当回调函数抛出异常,栈的追溯轨迹对异常的追踪毫无作用,只能告诉我们时间循环在运行回调,而不是为什么.那么协程是如何执行的呢?

    >>> def gen_fn():
    ...     raise Exception('my error')
    >>> caller = caller_fn()
    >>> caller.send(None)
    Traceback (most recent call last):
      File "<input>", line 1, in <module>
      File "<input>", line 3, in caller_fn
      File "<input>", line 2, in gen_fn
    Exception: my error

上面的栈调用记录很有用,显示了caller函数在向gen函数代理的时候跑出了异常.更有用的是,我们能在异常处理函数中封装调用,和普通的子程序一样.

    >>> def gen_fn():
    ...     yield 1
    ...     raise Exception('uh oh')
    ...
    >>> def caller_fn():
    ...     try:
    ...         yield from gen_fn()
    ...     except Exception as exc:
    ...         print('caught {}'.format(exc))
    ...
    >>> caller = caller_fn()
    >>> caller.send(None)
    1
    >>> caller.send('hello')
    caught uh oh

所以我们可以像正常使用协程一样把子程序加入fetch函数中,我们使用一个read协程来接收一个消息块:

    def read(sock):
        f = Future()

        def on_readable():
            f.set_result(sock.recv(4096))

        selector.register(sock.fileno(), EVENT_READ, on_readable)
        chunk = yield f  # Read one chunk.
        selector.unregister(sock.fileno())
        return chunk

在read函数之上使用一个read_all协程来接收整条消息:

    def read_all(sock):
        response = []
        # Read whole response.
        chunk = yield from read(sock)
        while chunk:
            response.append(chunk)
            chunk = yield from read(sock)

        return b''.join(response)

通过这样的封装,可以使yield from语句看起来消失,就像在调用传统的方法在完成阻塞IO.但实际上,read和read_all函数都是协程. yield from read语句在IO完成之前都将阻塞read\_all函数.当read\_all函数中断后,asyncio时间循环会去干其他事情并等待IO完成.read\_all函数在read收到真实的值完成工作后恢复运行.在函数调用栈底,fetch函数会首先调用read\_all.

    class Fetcher:
        def fetch(self):
             # ... connection logic from above, then:
            sock.send(request.encode('ascii'))
            self.response = yield from read_all(sock)

神奇的是,Task类不需要做任何改动.它还是像之前一样驱动fetch协程:

    Task(fetcher.fetch())
    loop()

当read yield返回预期结果,task实例通过yield from语句提供的通道接收到这个值,看上去就像直接从fetch函数中传出来的一样.当循环循环接收到预期值,task实例将结果传入fetch函数,read函授接收值就像task实例直接驱动read函数一样.


为了优化程序中协程的实现,我们需要修改一个瑕疵.我们的代码在等待预期结果的时候使用了yield语句,但是在将任务代理给子协程时使用了yield from 语句.我们使用yield from语句来中断协程会显得更精妙.这样使用可以让协程不必担忧它需要等待什么样的事件.我们的程序可以利用了python中生成器和迭代器共通的优点.这里可以重现一些方法使Future类实现可迭代:

    # Method on Future class.
    def __iter__(self):
        # Tell Task to resume me here.
        yield self
        return self.result

future实例的\__iter__方法也是一个协程,通过yield语句输出自己.现在当我们将代码换成这样:

    # f is a Future.
    yield f

    # with this
    # f is a Future.
    yield from f

不一样的代码但是结果都是相同的.负责驱动的Task类通过调用self.core.send(result)来接收预期结果.当future传回真正结果时,它会把新的结果传回协程.

到处使用yield from语句的优点在哪?这样写的优点和使用yield传出预期结果然后将其他工作交给子协程代理的方案相比优势在哪?这样写的优点其实在于现在一个方法能自由改变自身的实现但不会影响调用者.这样的方法也许是一个返回预期值的普通函数,也许是一个包含了yield from语句的生成器函数.在这种情况下,调用者函数只需要使用yield from语句等待结果就行了.

读到这里,我们差不多展示完了asyncio模块中协程的使用方法.我们深入了解了生成器的机制,然后简单的实现了future类和task类.我们简述了asyncio是如何实现下面两个优点的:并发IO比多线程更加高效并且比回调机制更优美.当然,真实应用asyncio模块的代码要比我们的程序更加复杂.真实的框架会使用零拷贝IO,平等调度,异常处理和其他一系列良好的功能.

对于使用asyncio模块的编码者来说,在代码中使用协程会更加地简化,在我们之前实现的程序中,可以看到回调,任务,预期结果.甚至包括非阻塞情况下调用select方法.但是当使用asyncio模块构建应用时,这些复杂的代码都不会出现.我们如此简化地抓取URL:

    @asyncio.coroutine
    def fetch(self, url):
        response = yield from self.session.get(url)
        body = yield from response.read()

介绍完了asyncio模块,让我们回到编写爬虫程序这个话题上来.

## 整合协程

文章一开始就在讨论爬虫程序如何工作,现在我们将会使用asyncio协程模型实现爬虫应用.

爬虫程序会从第一个页面开始抓取,然后解析成URL,最后将url存入队列中.当爬虫开始抓取其他网站时,爬虫会并行地抓取.但是为了限制在客户端和服务端限制规模,程序会设定一个并发的最大数量.当一个抓取工作完成时,这个子程序会立刻从队列中拉取新的连接继续抓取信息.当没有那么多连接需要抓取时,那些空闲的协程会停止工作.但是当一个协程访问一个页面抓取到大量新连接时,队列容量会突然扩大,那些空闲的协程会被唤醒然后继续工作.最后爬虫程序会在工作完成后自动退出.

想象一下如果这些被当做工人的子程序,如果这些子程序是线程,要如何表达爬虫的算法?我们需要python标准库提供的同步队列.每次有一项被加入到队列中,队列会增加task实例的数量.这些线程在完成各自的工作后会调用task_done方法.主线程会在执行Queue.join方法是阻塞知道与每一个队列内的项目匹配的线程调用task\_done方法才会退出.

协程通过asyncio模块和队列能实现相同的模式.首先需要引入asyncio队列:

    try:
        from asyncio import JoinableQueue as Queue
    except ImportError:
        # In Python 3.5, asyncio.JoinableQueue is
        # merged into Queue.
        from asyncio import Queue

我们需要在爬虫类中收集子程序共享的状态,然后在crawler方法中编写主要的逻辑.程序会从使用协程的crawler方法开始运行,然后运行事件循环直到函数执行完成:

    loop = asyncio.get_event_loop()

    crawler = crawling.Crawler('http://xkcd.com', max_redirect=10)

    loop.run_until_complete(crawler.crawl())

crawler对象实例化时会接收一个根url和最大的重定向数量作为参数,它会将这对参数存入队列,下面会介绍这样做的原因.

    class Crawler:
        def __init__(self, root_url, max_redirect):
            self.max_tasks = 10
            self.max_redirect = max_redirect
            self.q = Queue()
            self.seen_urls = set()

            # aiohttp's ClientSession does connection pooling and
            # HTTP keep-alives for us.
            self.session = aiohttp.ClientSession(loop=loop)

            # Put (URL, max_redirect) in the queue.
            self.q.put((root_url, self.max_redirect))

需要完成的任务数量为1,回到程序主脚本中,我们需要启动事件循环和调用crawler方法.

    loop.run_until_complete(crawler.crawl())

crawl这个协程函数负责启动一个个负责并行抓取工作的子程序,它就像一个主线程一样:crawl函数会在调用join方法时阻塞直到所有的子程序完成工作,而这些子程序只需要在后台运行.

    @asyncio.coroutine
    def crawl(self):
        """Run the crawler until all work is done."""
        workers = [asyncio.Task(self.work())
                   for _ in range(self.max_tasks)]

        # When all work is done, exit.
        yield from self.q.join()
        for w in workers:
            w.cancel()

如果用线程替代这些子程序,我们一定不愿意同时开启这些线程,除非真的需要线程资源时,我们需要尽量避免新建线程,一个线程池对于需求的容量会不断地增长.而协程资源是很廉价的,所以程序可以同时开启最大数量的子程序.

这里有一个有趣的点就是如何关闭爬虫程序.当join方法在接收实际结果时,子程序的任务是活着的只是处于挂起状态,代表它们在等待更多的url.所以主协程在退出之前需要取消它们的状态.那么如何取消一个任务操作呢?生成器有一个我们还未介绍的功能,我们能够从外部将一个异常扔入生成器函数中:

    >>> gen = gen_fn()
    >>> gen.send(None)  # Start the generator as usual.
    1
    >>> gen.throw(Exception('error'))
    Traceback (most recent call last):
      File "<input>", line 3, in <module>
      File "<input>", line 2, in gen_fn
    Exception: error

生成器函数会被throw方法恢复,但是这个操作也会引起一个异常.如果在生成器函数中没有代码去抓住这个异常,这个异常会从栈中不断冒泡,通过这个方法可以取消一个协程的运行状态:

    # Method of Task class.
    def cancel(self):
        self.coro.throw(CancelledError)

不论生成器函数在那一行yield from语句停住, 函数都会在那一行恢复然后抛出异常.我们可以在task类中的step方法中处理这个异常:

    # Method of Task class.
    def step(self, future):
        try:
            next_future = self.coro.send(future.result)
        except CancelledError:
            self.cancelled = True
            return
        except StopIteration:
            return

        next_future.add_done_callback(self.step)

现在一个task对象能知道自己被取消了,也不会再报出错误.一旦crawl方法取消了子程序,他也会随之退出.事件循环看到协程完成运行时也会退出运行.

    loop.run_until_complete(crawler.crawl())

crawl方法集成了所有主协程需要做的事,即子协程从队列中获取url,抓取内容然后解析成新的连接.每一个子程序独立地完成工作:

    @asyncio.coroutine
    def work(self):
        while True:
            url, max_redirect = yield from self.q.get()

            # Download page and add new links to self.q.
            yield from self.fetch(url, max_redirect)
            self.q.task_done()

python在发现这些代码中包含yield from语句时会将之编译成一个生成器函数.所以在crawl方法中,当主协程多次调用self.work方法时,它并不会多次执行这个方法,而是通过引用这段代码新建多个生成器对象,并且都在Task类中进行封装.task实例会接收每个生成器yield传出的预期值,然后通过调用send函数驱动生成器来获取真实结果,因为这些生成器拥有自己的栈帧,也拥有单独的临时变量和指令指针,可以单独地运行.这些子程序之间通过队列协作运行,可以通过下面的语句等待新的url:

    url, max_redirect = yield from self.q.get()

队列容器自带的get方法其实也是一个协程:它会在压入内容时停止,然后恢复运行并返回结果.在偶然的情况下,当主协程取消一个任务子程序时,crawl函数会随之停止,从协程的角度看,当yield from引起异常时它在循环中的最后一次遍历也随之停止.当一个任务子程序抓取页面解析出连接并仍入队列后,它会调用task_done方法来减少计数器.最后,一个子程序抓取页面时发现已经没有新的url,并且在队列中也没有任务.这时候统计子程序数量的计数器会相应地将数量减成零.这是时在等待join返回结果而停止的crawl函数会恢复运行.

这里需要解释一下队列中键值对的数据结构,就像下面这样:

    # URL to fetch, and the number of redirects left.
    ('http://xkcd.com/353', 10)

新的url还有剩余10个重定向,抓取这个url对应的页面会减少重定向的数量,相应地程序会把新的地址存入队列:

    # URL with a trailing slash. Nine redirects left.
    ('http://xkcd.com/353/', 9)

之前提到的aiohttp模块会默认帮助程序跟踪重定向并将最终响应结果返回给我们.在不同的程序入口遇到已经重复抓取过的url时,这个模块可以帮主我们合并这些指向相同地点的重定向路径.

爬虫程序在抓取"foo"路径时发现会重定向到"baz"路径,所以他会把"baz"路径加入到已抓取的url集合中.如果下个页面"bar"也会重定向到"baz"路径,程序就不会将"baz"路径加入队列.

    @asyncio.coroutine
    def fetch(self, url, max_redirect):
        # Handle redirects ourselves.
        response = yield from self.session.get(
            url, allow_redirects=False)

        try:
            if is_redirect(response):
                if max_redirect > 0:
                    next_url = response.headers['location']
                    if next_url in self.seen_urls:
                        # We have been down this path before.
                        return

                    # Remember we have seen this URL.
                    self.seen_urls.add(next_url)

                    # Follow the redirect. One less redirect remains.
                    self.q.put_nowait((next_url, max_redirect - 1))
             else:
                 links = yield from self.parse_links(response)
                 # Python set-logic:
                 for link in links.difference(self.seen_urls):
                    self.q.put_nowait((link, self.max_redirect))
                self.seen_urls.update(links)
        finally:
            # Return connection to pool.
            yield from response.release()

如果响应返回的是一个页面而不是重定向,fetch函数会将其解析成连接然后把它加入到队列.如果用多线程实现上面的代码在处理这种情况时会很麻烦.举个例子,在子程序的代码中会检查连接是否在seen_urls集合中,如果不在,会把连接加入到队列然后再把连接放入seen\_urls集合中.如果某个线程中这个操作被打断,另一个线程可能从另一个页面解析到相同的连接,并重复了之前的步骤,于是队列中出现了重复的数据,不仅造成了重复的工作还产生了错误的数据.然而对于协程来说,程序只会在遇到yield from语句时中断.在这个问题上,这一点是协程和多线程区别的关键点.多线程编程需要显式的临界区代码块,通过获取锁,否则程序是可中断的.而python的协程,默认是不可中断的,只有在执行到yield语句时才会放弃控制权.

我们不再不需要之前基于回调版本中那样的fetcher类,那样的方案体现了回调的缺点:在等待IO完成过程中,这些实例对象需要地方保存状态,因为对象的临时变量在回调函数互相调用时生命周期无法保持.但是现在的fetch协程函数能将这些临时变量像普通函数那样保存.当fetch方法完成生成了负责抓取工作的work方法,work方法会调用task_done方法然后从队列中拿到下一个url继续工作.当fetch方法将新的连接存入队列并增加未完成任务的数量,正在等待q.join结果而停止的主协程会继续等待.当没有新的连接并且没有连接需要抓取时,work方法通过调用task\_done方法将未完成任务的数量减少成0.这个事件会恢复join方法,同时主协程也完成工作.

    class Queue:
        def __init__(self):
            self._join_future = Future()
            self._unfinished_tasks = 0
            # ... other initialization ...

        def put_nowait(self, item):
            self._unfinished_tasks += 1
            # ... store the item ...

        def task_done(self):
            self._unfinished_tasks -= 1
            if self._unfinished_tasks == 0:
                self._join_future.set_result(None)

        @asyncio.coroutine
        def join(self):
            if self._unfinished_tasks > 0:
                yield from self._join_future

上面就是主协程的代码,crawl方法接收yield from join表达式的值,所以当最后的子协程将未完成任务减少到零,它会示意crawl方法恢复并结束.至于程序如何结束,既然crawl方法是一个生成器函数,调用时会返回一个生成器对象.为了驱动这个生成器,需要在task类上加上了asyncio装饰.

    class EventLoop:
        def run_until_complete(self, coro):
            """Run until the coroutine is done."""
            task = Task(coro)
            task.add_done_callback(stop_callback)
            try:
                self.run_forever()
            except StopError:
                pass

    class StopError(BaseException):
        """Raised to stop the event loop."""

    def stop_callback(future):
        raise StopError

当任务完成时会引起StopError异常,循环通过这个异常表示程序正常运行结束了.但是task为什么会调用add\_done_callback方法?你也许会认为这里的task和future类似.你的直觉是正确的.我们必须承认之前没有解释的Task类,task类继承自future类.

    class Task(Future):
        """A coroutine wrapped in a Future."""

正常情况下一个future实例会在调用set_result方法是被解析,但是当协程停止时task实例会解析自身.仔细想一想之前python生成器在返回结果时会抛出的异常:

    # Method of class Task.
    def step(self, future):
        try:
            next_future = self.coro.send(future.result)
        except CancelledError:
            self.cancelled = True
            return
        except StopIteration as exc:

            # Task resolves itself with coro's return
            # value.
            self.set_result(exc.value)
            return

        next_future.add_done_callback(self.step)

所以当事件循环调用task.add\_done\_callback(stop_callback)时,它会准备被task停止,下面会再一次运行run\_until\_complete方法.

    # Method of event loop.
    def run_until_complete(self, coro):
        task = Task(coro)
        task.add_done_callback(stop_callback)
        try:
            self.run_forever()
        except StopError:
            pass

当task实例抓住StopIteration异常然后解析自身,回调函数再循环中会引起StopError,事件循环随之终止调用栈中的run\_until_complete方法.我们的程序也会结束.

## 总结

现在的程序越来越多的是IO密集型而非cpu密集型.对于这些类型的程序,python线程是最差的解决方案,全局的解释器锁会阻止这些程序同时执行计算,而优先级切换会使一些程序很难得到控制权.异步通常是正确的解决模式.但是基于回调的异步机制随着代码的增多,整个程序会变得杂乱不堪.协程与之相比就是一个整洁的选择:通过子程序的代理机制和完善的异常处理以及堆栈记录.如果从忽略yield from语句的角度看,一个协程看起来是一个执行传统阻塞IO的线程.我们甚至可以结合多线程中经典的协作模式,并且不需要做复杂的改变,因此和回调相比,协程对于经历过编程的程序员是一个诱人的词语.但当我们睁开眼睛将注意力放在yield from语句上,我们能从协程放弃控制权允许其他协程运行的行为上发现关键点,和线程不同,协程显式地告诉编码者什么地方可以中断什么地方不可以.Glyph Lefkowitz曾说过这样的话:线程使得局部推理代码变得困难,而局部推理是软件开发中最重要的事情.显式使用yield语句,使得通过测试这段程序而非测试整个系统来理解程序的行为变成可能.这篇文章是在python和异步发展史中复兴期写的.基于生成器的协程,就是上文介绍的例子,在2014年3月正式在python的asyncio模块中发布.在2015年9月,python3.5正式将协程纳入语言的特性中.这个内置的语言特性可以通过新的语法"async def"来声明,而不是之前的"yield from",新的协程通过关键词"await"来代理一个协程或等待一个预期值.
除了这些更新,协程本质的实现思想没有改变.python新的协程特性虽然在语法和生成器不同但是工作原理很类似.实际上,两者在python解析其中会共享同一种实现方式.Task,Future和事件循环依旧在asyncio模块中扮演着原来的角色.现在既然你已经知道了asyncio协程的原理,你大可忘记其中的细节,这些细节的机制被良好的接口封装起来.但是通过理解实现原理可以帮助我们在异步环境中正确高效地编写代码.






