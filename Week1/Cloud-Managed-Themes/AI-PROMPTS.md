# AI assistance and prompt provenance

The showcase implementation specification summarizes requirements from the conversation. It is not a verbatim prompt submitted to a second model.

## Tools and ownership

Hermes Agent using the OpenAI provider authored the SQL, JavaScript, tests, documentation, and showcase adaptation. Dmitriy supplied requirements and performed login, project creation, and SQL execution. Student-authored coding and independent human QA are not claimed.

## Verbatim primary user request

> Ok, I need a step by step have a supabase-powered theme system on my resume rendered through the cloudflare, but makesure it is step by step you doing it and requiring me to either login to the supabase, and you need to open up all those preview windows where my intervention needed, and I will login and follow instructions that you can't do it yourself but everything else is on you. Also, will complete it in a separate Week8 folder that you need to begin, so that we can get it up and running, but then after everything functions will have it transition to a separate repo called AD371. So, get the Resume folder in created Week8 folder copied and copy the master prompt in there too. and lets begin. I expect to have this as a separate show case

## Verbatim recovery instruction

> proceed, I don't know what happened

## Genuine corrections and scope refinements

- The earlier catalog proposal demonstrated an API connection but did not power the real theme system. The user requested control of defaults and menu order.
- Cloudflare hosting and Supabase persistence have separate responsibilities. No Cloudflare Worker is required for this browser-to-Supabase read.
- Paused-project count was not treated as a quota failure. Earlier class databases were not modified.
- Interrupted copying was resumed and hash-verified before editing.
- An early unit assertion accidentally matched the missing-module message. The message was corrected and all 20 tests were verified RED before implementation.
- Showcase generation encountered a Python syntax error, suppressed duplicate reads, and an unanchored pattern matching a nested demo main. These unsuccessful attempts were corrected before any completed artifact was reported.

## Verification boundary

Official sources ground architecture claims. Browser request observations are not internal telemetry. Offline simulation is explicitly labeled. README and QA artifacts identify checks that actually ran; deployment and user visual approval are separate checkpoints.

## Verbatim category/content revision request

> So here is the thing, I do like it, and it looks good, but we'll need to change the looks of it and well need to have CSS showcases separate from the Application Structures showcases. Also the 7 Step looks was for the CSS, but we'll need to come up with a unique one for Application Structures showcases. For now, I just want to separate the CSS showcases, from application structures showcases. What would be your suggestion? Other than that, it looks good, but in layer 1 you mention my temporary instructions for Week 8, Why? also check this App Structure showcase for ambigious content like that and anything that just makes no sense in content and fix it

The user selected **Navigation and resume categories — recommended**. The unique Application Structures presentation was explicitly deferred. This change removes temporary instructions from visitor-facing requirements while retaining the genuine historical request above and earlier prompts.
