---
layout: post
title:  "PHP-mongoDB-data-lock"
date:   2015-11-20
categories: PHP
excerpt: Implement data lock with mongoDB
---

## 原理

### acquire

- 使用mongodb的原子操作`findAndModify`更新lock表中的`locked`值为`true`。
    - 查询条件：
        - `expireAt` 已过期
    - 更新条件：
        - `locked` => `true`
        - `expireAt` 为当前时间加**1分钟**
    - 使用`upsert`选项，如果不存在则插入，注意，`upsert`操作有可能因唯一索引冲突而失败，若发生这种情况应继续尝试加锁
    - 同时取出修改以前的值`oldLock`
- 判断`oldLock`
    - 如果`oldLock`为`true`，或者`oldLock.locked`为`false`，表示锁以前不存在或没有被锁，加锁成功。
    - 如果`oldLock.expireAt`存在，则说明之前的锁超时了，打warning log
    - 如果`oldLock.locked`为`true`，表示锁已经被占用，加锁失败，进入轮询等待。
- **每3秒**查询一次锁，直到锁被释放或超时

### release

- 将lock的`locked`更新为false，`expireAt`更新为null

## 栗子

{% highlight php %}
public static function acquire($key)
{
    $oldLock = null;
    while (true) {
        $condition = [
            'key' => $key,
            '$or' => [[
                'expireAt' => null,
            ],[
                'expireAt' => ['$lt' => new \MongoDate()]
            ]]
        ];

        $update = [
            '$setOnInsert' => [
                'key' => $key,
            ],
            '$set' => [
                'locked' => true,
                'expireAt' => new \MongoDate(time() + self::EXPIRE_TIME)
            ]
        ];
        try {
            $oldLock = static::findAndModify($condition, $update, ['upsert' => true]);
            break;
        } catch (yii\mongodb\Exception $e) {
            sleep(self::ACQUIRE_LOCK_INTERVAL);
            continue;
        }
    }

    if (!empty($oldLock)) {
        if (!empty($oldLock['expireAt'])) {
            LogHelper::warning(__METHOD__, 'lock timeout', ['key' => $key]);

            while ($oldLock['locked']) {
                sleep(self::ACQUIRE_LOCK_INTERVAL);
                $oldLock = static::findAndModify(['key' => $key], $update);
            }
        }
    }
}

public static function release($key)
{
    $condition = ['key' => $key, 'locked' => true];
    $update = ['$set' => ['locked' => false, 'expireAt' => null]];
    static::findAndModify($condition, $update);
}
{% endhighlight %}