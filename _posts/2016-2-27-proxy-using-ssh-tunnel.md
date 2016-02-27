---
layout: post
title:  "Proxy Using SSH Tunnel"
date:   2015-10-12
categories: Network
excerpt: Proxy Using SSH Tunnel
---

* content
{:toc}

## simple example

> If we can access a server and we want to use it as a socks5 proxy server.

{% highlight shell %}
$ ssh -D 12345 username@proxy_server
{% endhighlight %}

Then set the proxy option in browser to use socks5 proxy 127.0.0.1:12345.

`PS`: 在linux下,chrome只支持全局设置,所以需要安装插件chrome proxyhelper

## Interpretation

This uses ssh’s “dynamic” port forwarding function by using parameter “-D”. ssh allocates a socket to listen to port on the local side, optionally bound to the specified ip address. Whenever a connection is made to this port, the connection is forwarded over the ssh channel, and the application protocol is then used to determine where to connect to from the remote machine.

### Proxy listening to localhost port only

This proxy server can only be used on localhost, so other users can not use it.

{% highlight shell %}
$ ssh -D port username@proxy_server
{% endhighlight %}

The simple example use this method.

The port is on localhost(Any port larger than 1024 can be chosen).Then set the proxy option in browser.

### Proxy listening to specific IP

This kind of proxy server can be used by others.

{% highlight shell %}
$ ssh -D serverIP:port username@proxy_server
{% endhighlight %}

Then set proxy address option in browser with `serverIP:port`

- Some useful ssh arguments
    - C  Requests gzip compression of all data
    - T  Disable pseudo-tty allocation
    - N  Do not execute a remote command. This is useful for just forwarding ports.
    - f  Requests ssh to go to background just before command execution.
    - n  Redirects stdin from /dev/null (actually, prevents reading from stdin).
    - q  Quiet mode. Causes most warning and diagnostic messages to be suppressed.

- some examples

{% highlight shell %}
$ ssh -CnfND 12345 username@proxy_server

# when you want to close the ssh proxy tunnel, you can find the pid
$ ps aux | grep ssh

# you can kill it or let it run in the shell
$ ssh -CTND 12345 username@sshd_server

# you can listen on all addresses on the host by:
$ ssh -D "*:12345" username@sshd_server

{% endhighlight %}
