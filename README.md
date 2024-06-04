This fork is intended to make the VIEW intervalometer more stable, predictable in ramping, alghoritms and eliminate bugfixes. I can only support sony cameras since I'm able to test it only on Sony A6300 and A6600.

For now, I understand in general how VIEW works, what algorithm is used, and why it can go extremely dark or light. As for now, I see that the estimated ramping should be different, the histogram and luminance are incorrect, hightlights protection calculations can produce underexposure, so it is better to turn it off. Further investigations are required.

Releases are provided AS IS. I've already soft bricked my VIEW during development and spent some nervous nights trying to restore it. The provided releases were tested to run on my view. Just download archieve on your SD card and install an update via `Firmware Update` menu. If anything goes wrong, refer to troubleshooting in official docs to rollback to other versions.Feel free to contact me to discuss ideas, VIEW development and further enhancements.

TODO:
* video advance in clips via knob
* histogram in capture and exposure
* mobile app build
* new cameras?

------------------------------------------
<img alt="Timelapse+ VIEW Intervalometer" src="https://static1.squarespace.com/static/5318bacfe4b03ba2018b9945/5318bdcce4b04f773bfbb207/585c56295016e19f2cbefd4a/1482446382681/284A7536.jpg?format=475w" width="475">

# Timelapse+ VIEW Intervalometer

📷 Innovative solutions for time-lapse.

## Docs

**[Official VIEW documentation](http://docs.view.tl/)**

**[Documentación oficial de VIEW](http://es.view.tl/)**

[Developer documentation for the VIEW](DEVELOPER.md)
