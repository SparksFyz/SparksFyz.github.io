---
layout: post
title:  "Kubernetes concept"
date:   2016-2-2
categories: Django
excerpt: kubernetes concept
---

[kubernetes doc](http://kubernetes.io/)

## Concept

### Overview

Kubernetes是Google开源的容器集群管理系统，其提供应用部署、维护、 扩展机制等功能,主要的功能如下:

- 使用Docker对应用程序包装(package)、实例化(instantiate)、运行(run)

- 以集群的方式运行、管理跨机器的容器

- 解决Docker跨机器容器之间的通讯问题

- 自我修复机制使得容器集群总是运行在用户期望的状态

### Pod

  pod是系统中操作部署的最基本的单元,例如一个系统由前后端和数据库组成,那么创建三个docker container,分别对应前端,后端和数据库,并且放置在一个pod中,相当于提供了一个完整的服务.

### Master

Master由apiserver,schedule和replication controller(rc)构成.

- apiserver:

  apiserver是k8s的入口,封装了增删改查操作,以RESTful的接口方式提供给外部用户和内部组件(例如rc),而apiserver维护的REST对象持久化在etcd中.

- shcedule:

  schedule用来调度集群的资源,例如为新建的pod分配机器,

- RC:

  RC用来确保实际运行的pod数量与配置的一致,如果有pod挂了,RC会让schedule启动新的pod,确保提供服务的pod数量保持不变,提供扩容和缩容的功能.

- label:

  label是关联资源的键值对, 用于关联pod,rc和service. service和rc是在pod之上抽象出来的对象,用来管理和控制pod, 他们之间通过label关联.

### Slave(node/minion)

node主要由kubelet和proxy组成,一个node下可以包含多个pod,相当于一个node提供了一个集群服务.

- kubelet:

  kubelet主要负责管理和控制docker容器,比如监控和启停,接收apiserver的请求,从etcd获取信息对pod进行操作和返回pod的状态.

- proxy:

  主要负责node中pod之间的通信.


### service

外部用户通过service来访问pod

service定义了pods的集合并且提供方法来使用pods,相当于是pod的路由代理抽象,例如为pod提供了ip地址和DNS,负责搜集pod的运行状态.

> 如果想访问pod提供的服务,必须访问service,而不能直接访问某个pod,因为pod的状态是动态变化的.















