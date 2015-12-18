---
layout: post
title:  "阻止浏览器默认事件"
date:   2015-12-18 10:22:00
categories: Javascript
excerpt: 阻止浏览器默认事件
---

* content
{:toc}


### 原理

> e.preventDefault

{% highlight js startinline %}
var el = window.document.getElementById("a");
    el.onclick = function (e) {
        //如果提供了事件对象，则这是一个非IE浏览器
        if (e && e.preventDefault) {
            //阻止默认浏览器动作(W3C)
            e.preventDefault();
        }
        else {
            //IE中阻止函数器默认动作的方式
            window.event.returnValue = false;
            return false;
        }
}
{% endhighlight %}

### 栗子

> 子元素scroll父元素容器不跟随滚动

正常情况下, mouse放在子元素上面,子元素scroll到边界的时候, 继续滚动会触发父容器滚动.
如果想要父容器不跟随,必须在边界的时候通过 `event.preventDefault()` 阻止, 即scrollTop()等于0或最大滚动高度.

另外此处IE不兼容,需要在到达边界之前就阻止, 一般的解决方法是  在到达边界的前一次滚动就调用 `preventDefault()`


下面是拿来的代码:

{% highlight js startinline %}
$.fn.scrollUnique = function() {
    return $(this).each(function() {
        var eventType = 'mousewheel';
        // 火狐是DOMMouseScroll事件
        if (document.mozHidden !== undefined) {
            eventType = 'DOMMouseScroll';
        }
        $(this).on(eventType, function(event) {
            // 一些数据
            var scrollTop = this.scrollTop,
                scrollHeight = this.scrollHeight,
                height = this.clientHeight;

            var delta = (event.originalEvent.wheelDelta) ? event.originalEvent.wheelDelta : -(event.originalEvent.detail || 0);

            if ((delta > 0 && scrollTop <= delta) || (delta < 0 && scrollHeight - height - scrollTop <= -1 * delta)) {
                // IE浏览器下滚动会跨越边界直接影响父级滚动，因此，临界时候手动边界滚动定位
                this.scrollTop = delta > 0? 0: scrollHeight;
                // 向上滚 || 向下滚
                event.preventDefault();
            }
        });
    });
};
{% endhighlight %}
