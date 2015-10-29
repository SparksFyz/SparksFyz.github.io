---
layout: post
title:  "Yii2 Request Lifecycle"
date:   2015-10-29
categories: Yii
excerpt: Yii2 Request Lifecycle
---

* content
{:toc}

### Request Lifecycle

1. make a request to entry script(index.php).
2. entry script loads the app.config and creates an application instance to handle the request.
3. app can resolve requested route by request components like urlmanager
4. Then app will create a controller instance.
5. controller creates an action instance and performs the filters for the action.
  * If any filter fails, the action is cancelled.
  * If all filters pass, the action is executed.
6. action loads a data model from database.
7. action renders a view, providing it with the data model.
8. The rendered result is returned to the response application component.
9. The response component sends the rendered result to the user's browser.


![request-lifecycle](/static/image/request-lifecycle.png)