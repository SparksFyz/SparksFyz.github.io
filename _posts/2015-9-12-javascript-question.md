---
layout: post
title:  "Javascript Questions"
date:   2015-9-12
categories: Javascript
excerpt: some code questions about javascipt
---

* content
{:toc}

### this

{% highlight js%}
function foo() {
  console.log(this.a);
}

function doFoo(fn) {
  fn();
}

function foFoo2(o) {
  o.foo();
}

var obj = {
  a: 2,
  foo: foo
}
var a = "aaaa";
foFoo(obj.foo);
doFoo2(obj);
{% endhighlight %}

Result:

> aaa

> 2

----------------------------------

### apply(call,bind)改变函数作用域

{% highlight js %}
function foo(something){
  console.log(this.a,something);
}
function bind(fn, obj){
  return function(){
    return fn.apply(obj,arguments);
  }
}
var obj = {
  a: 2
}
var bar = bind(foo, obj);
var b = bar(3);
console.log(b);
{% endhighlight %}

> apply、call、bind都有个作用就是改变作用域，这里用apply将foo函数的作用域指向obj对象，同时传入参数。
再简单分析一下bind函数内部的嵌套，执行bind函数的时候返回的是一个匿名函数，所以执行bar(3)的时候实际上是执行的bind内部的匿名函数，返回的是之前传入的foo函数的执行结果。
函数没有返回值的情况下默认返回undefined。

Result:

> 2

> 3

----------------------------------

### new关键字

{% highlight js %}
function foo(a,b){
    this.val = a+b;
}
var bar = foo.bind(null, 'p1');
var baz = new bar('p2');
console.log(baz.val);
{% endhighlight %}

> bind函数的第一个参数为null代表作用域不变，后面的不定参数将会和函数本身的参数按次序进行绑定，绑定之后执行函数只能从未绑定的参数开始传值。

Result:

> p1p2

----------------------------------

### 自执行函数

{% highlight js %}
function foo(){
    console.log(this.a);
}
var a = 2;
var o = {a:3,foo:foo};
var p = {a:4};
(p.foo=o.foo)();
{% endhighlight %}

> 创建一个立即执行的函数同时避免污染全局变量,赋值语句执行之后会返回当前值。也就是说当括号内执行完赋值之后，返回的是o对象中的foo函数。函数的执行环境中有一个a对象

Result:

> 2

----------------------------------

### 变量属性

{% highlight js %}
var a = [];
a[0] = 1;
a['foobar'] = 2;
console.log(a.length);
console.log(a.foobar);
{% endhighlight %}

> length属性的值是这个数组最大整数属性名加上1，不一定等于数组里属性的个数。

Result:

> 1

> 2
