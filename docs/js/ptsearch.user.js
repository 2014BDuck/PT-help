// ==UserScript==
// @name         Pt-search
// @namespace    http://blog.rhilip.info
// @version      20180113.1
// @description  Pt-search 配套脚本
// @author       Rhilip
// @run-at       document-end
// @include      http://localhost*
// @include      http*://rhilip.github.io/PT-help/ptsearch*
// @updateURL    https://github.com/Rhilip/PT-help/raw/master/docs/js/ptsearch.user.js
// @supportURL   https://github.com/Rhilip/PT-help/issues/2
// @connect      *
// @grant        GM_xmlhttpRequest
// ==/UserScript==

var script_version = '';
if (GM_info && GM_info.script) {
    script_version = GM_info.script.version || script_version;
}

var time_regex = /(\d{4}-\d{2}-\d{2} ?\d{2}:\d{2}:\d{2})/;

/**
 * @return {number}
 */
function FileSizetoLength(size) {
    var _size_raw_match = size.match(/^([\d.]+)[^TGMK]?([TGMK]?i?B)$/);
    if (_size_raw_match) {
        var _size_num = parseFloat(_size_raw_match[1]);
        var _size_type = _size_raw_match[2];
        switch (true) {
            case /Ti?B/.test(_size_type):
                return _size_num * Math.pow(2, 40);
            case /Gi?B/.test(_size_type):
                return _size_num * Math.pow(2, 30);
            case /Mi?B/.test(_size_type):
                return _size_num * Math.pow(2, 20);
            case /Ki?B/.test(_size_type):
                return _size_num * Math.pow(2, 10);
            default:
                return _size_num;
        }
    }
    return size;
}

/**
 * @return {string}
 */
function TimeStampFormatter(data) {
    var unixTimestamp = new Date(data);
    return unixTimestamp.toLocaleString();
}

$(document).ready(function () {
    var table = $("#table");
    if (table) {    // 存在Bootstrap Table
        // 移除Tampermonkey提示，显示隐藏表格
        $("#use-tampermonkey").hide();
        $("#hide-without-tampermonkey").show();
    }

    var search_log = $("#search-log");

    function writelog(text) {
        search_log.append("<li>" + TimeStampFormatter(Date.now()) + " - " + text + "</li>");
    }

    // 搜索开始
    $("#advsearch").click(function () {
        // 获取搜索设置
        var search_text = $("#keyword").val().trim();     // 搜索文本
        var search_site = localStorage.getItem('selected_name').split(',') || [];   // 搜索站点
        var config_log = $("#config-log").prop("checked"); // 搜索日志记录

        table.bootstrapTable('removeAll');  // 清空已有表格信息
        search_log.html('');   // 清空原有搜索日志

        function table_append(data) {
            table.bootstrapTable('append', data);
            if (config_log) {
                var _data_str = "";
                for (var i in data) {
                    _data_str += i + ": " + data[i] + "; ";
                }
                writelog(_data_str);
            }
        }

        // 通用处理模板，如果默认解析模板可以解析该站点则请不要自建解析方法
        // NexusPHP类站点
        function NexusPHP(site, url_prefix, search_prefix, torrent_table_selector) {
            if ($.inArray(site, search_site) > -1) {
                writelog("Start Searching in Site " + site + ", Using The normal parser for NexusPHP.");
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: search_prefix + search_text,
                    onload: function (responseDetail) {
                        var resp = responseDetail.responseText;
                        if (responseDetail.finalUrl.search("login") > -1) {
                            writelog("Not Login in Site " + site + ".");
                        } else {
                            writelog("Get Search Pages Success in Site " + site + ".");
                            var body = resp.match(/<body[^>]*>[\s\S]*<\/body>/gi)[0];
                            var page = $(body); // 构造 jQuery 对象
                            var tr_list = page.find(torrent_table_selector || ".torrents > tbody > tr:gt(0)");
                            writelog("Get " + tr_list.length + " records in Site " + site + ".");
                            for (var i = 0; i < tr_list.length; i++) {
                                var torrent_data_raw = tr_list.eq(i);
                                var _tag_name = torrent_data_raw.find("a[href*='hit']");

                                // 确定日期tag，因用户在站点设置中配置及站点优惠信息的情况的存在，此处dom结构会有不同
                                // 此外多数站点对于 seeders, leechers, completed 没有额外的定位信息，故要依赖于正确的日期tag
                                var _tag_date, _date;
                                _tag_date = torrent_data_raw.find((site === "U2") ? "time" : "span").filter(function () {
                                    return time_regex.test($(this).attr("title"));
                                }).last().parent("td");
                                if (/[分时天月年]/.test(_tag_date.text())) {
                                    _date = _tag_date.children((site === "U2") ? "time" : "span").attr("title");
                                } else {
                                    _tag_date = torrent_data_raw.find("td").filter(function () {
                                        return time_regex.test($(this).text());
                                    }).last();
                                    _date = _tag_date.text().match(time_regex)[1].replace(/-(\d{2}) ?(\d{2}):/, "-$1 $2:");
                                }

                                var _tag_size = _tag_date.next("td");
                                var _tag_seeders = _tag_size.next("td");
                                var _tag_leechers = _tag_seeders.next("td");
                                var _tag_completed = _tag_leechers.next("td");

                                table_append({
                                    "site": site,
                                    "name": _tag_name.attr("title") || _tag_name.text(),
                                    "link": url_prefix + _tag_name.attr("href"),
                                    "pubdate": Date.parse(_date),
                                    "size": FileSizetoLength(_tag_size.text()),
                                    "seeders": _tag_seeders.text().replace(',', ''),
                                    "leechers": _tag_leechers.text().replace(',', ''),
                                    "completed": _tag_completed.text().replace(',', '')
                                });
                            }
                        }
                        writelog("End of Search Site " + site + ".");
                    }
                });
            }
        }

        // 开始各站点遍历
        writelog("Script Version: " + script_version + ", Choose Site List: " + search_site.toString() + ", With Search Keywords: " + search_text);
        // 教育网通用模板解析
        NexusPHP("BYR", "https://bt.byr.cn/", "https://bt.byr.cn/torrents.php?search=");
        NexusPHP("WHU", "", "https://pt.whu.edu.cn/torrents.php?search=", ".torrents tr:gt(0)");
        NexusPHP("NWSUAF6", "https://pt.nwsuaf6.edu.cn/", "https://pt.nwsuaf6.edu.cn/torrents.php?search=");
        NexusPHP("XAUAT6", "http://pt.xauat6.edu.cn/", "http://pt.xauat6.edu.cn/torrents.php?search=");
        NexusPHP("NYPT", "https://nanyangpt.com/", "http://nanyangpt.com/torrents.php?search=");
        NexusPHP("SJTU", "https://pt.sjtu.edu.cn/", "https://pt.sjtu.edu.cn/torrents.php?search=");
        NexusPHP("CUGB", "http://pt.cugb.edu.cn/", "http://pt.cugb.edu.cn/torrents.php?search=");
        NexusPHP("HUDBT", "", "https://hudbt.hust.edu.cn/torrents.php?search=", ".torrents tr:gt(0)");
        NexusPHP("TJUPT", "https://tjupt.org/", "https://tjupt.org/torrents.php?search=");

        // 教育网不能使用通用NexusPHP解析的站点
        if ($.inArray("NPU", search_site) > -1) {     // NPUPT
            writelog("Start Searching in NPUPT.");
            GM_xmlhttpRequest({
                method: 'GET',
                url: "https://npupt.com/torrents.php?search=" + search_text,
                onload: function (responseDetail) {
                    var resp = responseDetail.responseText;
                    if (responseDetail.finalUrl.search("login") > -1) {
                        writelog("Not Login in Site NPUPT.");
                    } else {
                        var body = resp.match(/<body[^>]*>[\s\S]*<\/body>/gi)[0];
                        var page = $(body); // 构造 jQuery 对象
                        var tr_list = page.find("#torrents_table tr");
                        for (var i = 1; i < tr_list.length; i += 3) {
                            var torrent_data_raw = tr_list.eq(i);
                            var _tag_name = torrent_data_raw.find("a[href*='hit']");
                            var _date = torrent_data_raw.find("span[title*='-'][title*=':'][title^='20']").attr("title") || $.trim(torrent_data_raw.find("div.small").text()) || torrent_data_raw.text().match(/(\d{4}-\d{2}-\d{2} ?\d{2}:\d{2}:\d{2})/)[1].replace(/-(\d{2}) ?(\d{2}):/, "-$1 $2:");
                            var _tag_size = torrent_data_raw.find("center");

                            table_append({
                                "site": "NPU",
                                "name": _tag_name.attr("title") || _tag_name.text(),
                                "link": "https://npupt.com/" + _tag_name.attr("href"),
                                "pubdate": Date.parse(_date),
                                "size": FileSizetoLength(_tag_size.text()),
                                "seeders": torrent_data_raw.find("span.badge").eq(0).text(),
                                "leechers": torrent_data_raw.find("span.badge").eq(1).text(),
                                "completed": parseInt(torrent_data_raw.find("a[href^='viewsnatches.php?id=']").text()) || 0
                            });
                        }
                    }
                    writelog("End of Search Site NPUPT.");
                }
            });
        }
        if ($.inArray("ZX", search_site) > -1) {     // ZX
            writelog("Start Searching in ZX.");
            GM_xmlhttpRequest({
                method: 'GET',
                url: "http://pt.zhixing.bjtu.edu.cn/search/x" + search_text,
                onload: function (responseDetail) {
                    var resp = responseDetail.responseText;
                    if (responseDetail.finalUrl.search("login") > -1) {
                        writelog("Not Login in Site ZX.");
                    } else {
                        var body = resp.match(/<body[^>]*>[\s\S]*<\/body>/gi)[0];
                        var page = $(body); // 构造 jQuery 对象
                        var torrent_list_table = page.find(".torrenttable tr");
                        writelog("Get " + torrent_list_table.length + " records in Site ZX.");
                        for (var i = 1; i < torrent_list_table.length; i++) {
                            var torrent_data_raw = torrent_list_table.eq(i);

                            var _tag_name = torrent_data_raw.find("a[name='title']");
                            var _tag_size = torrent_data_raw.find("td.r");
                            var _tag_date = _tag_size.next("td").next("td").next("td");
                            var _tag_seeders = _tag_date.next("td");
                            var _tag_leechers = _tag_seeders.next("td");
                            var _tag_completed = _tag_leechers.next("td");

                            // 对这个站点的垃圾时间简写进行标准化
                            var _date, myDate = new Date();
                            var _tag_date_text = _tag_date.text();
                            switch (true) {
                                case /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(_tag_date_text):   // "2017-12-29 22:44"（完整，不需要改动）
                                    _date = Date.parse(_tag_date_text);
                                    break;
                                case /\d{2}-\d{2} \d{2}:\d{2}/.test(_tag_date_text):   // "01-06 10:05"（当年）
                                    _date = Date.parse(myDate.getFullYear() + "-" + _tag_date_text);
                                    break;
                                case /\d{2}:\d{2}/.test(_tag_date_text):   // "18:50"（当日）
                                    _date = Date.parse(myDate.getFullYear() + "-" + (myDate.getMonth() + 1) + "-" + myDate.getDate() + " " + _tag_date_text);
                                    break;
                            }

                            table_append({
                                "site": "ZX",
                                "name": _tag_name.text(),
                                "link": "http://pt.zhixing.bjtu.edu.cn" + _tag_name.attr("href"),
                                "pubdate": _date,
                                "size": FileSizetoLength(_tag_size.text()),
                                "seeders": _tag_seeders.text().replace(',', ''),
                                "leechers": _tag_leechers.text().replace(',', ''),
                                "completed": _tag_completed.text().replace(',', '')
                            });
                        }
                    }
                    writelog("End of Search Site ZX.");
                }
            });
        }

        // 公网通用模板解析
        NexusPHP("HDSKY", "https://hdsky.me/", "https://hdsky.me/torrents.php?search=", ".torrents tr.progresstr");
        // TODO Hyperay
        NexusPHP("HDHome", "https://hdhome.org/", "https://hdhome.org/torrents.php?search=");
        NexusPHP("HDHome(Live)", "https://hdhome.org/", "https://hdhome.org/live.php?search=");
        NexusPHP("HDTime", "https://hdtime.org/", "https://hdtime.org/torrents.php?search=");
        NexusPHP("HDU", "https://pt.hdupt.com/", "https://pt.hdupt.com/torrents.php?search=");
        NexusPHP("JoyHD", "https://www.joyhd.net/", "https://www.joyhd.net/torrents.php?search=");
        NexusPHP("CHDBits", "https://chdbits.co/", "https://chdbits.co/torrents.php?search=");
        NexusPHP("Ourbits", "https://ourbits.club/", "https://ourbits.club/torrents.php?search=", ".torrents tr[class^='sticky_']");
        NexusPHP("OpenCD", "https://www.open.cd/", "https://www.open.cd/torrents.php?search=");
        NexusPHP("SolaGS", "https://solags.org/", "https://solags.org/torrents.php?search=");
        NexusPHP("TTHD", "http://tthd.org/", "http://tthd.org/torrents.php?search=");
        NexusPHP("KeepFrds", "https://pt.keepfrds.com/", "https://pt.keepfrds.com/torrents.php?search=");
        NexusPHP("TCCF", "https://et8.org/", "https://et8.org/torrents.php?search=");
        NexusPHP("U2", "https://u2.dmhy.org/", "https://u2.dmhy.org/torrents.php?search=");
        NexusPHP("CMCT", "https://hdcmct.org/", "https://hdcmct.org/torrents.php?search=");
        NexusPHP("MTeam", "https://tp.m-team.cc/", "https://tp.m-team.cc/torrents.php?search=");
        NexusPHP("MTeam(Adult)", "https://tp.m-team.cc/", "https://tp.m-team.cc/adult.php?search=");
        // TODO GZTown
        // TODO HD4FANS

        // 公网不能使用通用NexusPHP解析的站点
        if ($.inArray("HDChina", search_site) > -1) {
            writelog("Start Searching in Site HDChina.");
            GM_xmlhttpRequest({
                method: 'GET',
                url: "https://hdchina.org/torrents.php?search=" + search_text,
                onload: function (responseDetail) {
                    var resp = responseDetail.responseText;
                    if (responseDetail.finalUrl.search("login") > -1) {
                        writelog("Not Login in Site HDChina.");
                    } else {
                        var body = resp.match(/<body[^>]*>[\s\S]*<\/body>/gi)[0];
                        var page = $(body); // 构造 jQuery 对象
                        var tr_list = page.find(".torrent_list tr:odd");
                        writelog("Get " + tr_list.length + " records in Site HDChina.");
                        for (var i = 0; i < tr_list.length; i++) {
                            var torrent_data_raw = tr_list.eq(i);
                            var _tag_name = torrent_data_raw.find("a[href*='hit']");

                            var _date, _tag_date = torrent_data_raw.find(".t_time");
                            if (/[分时天月年]/.test(_tag_date.text())) {
                                _date = _tag_date.children("span").attr("title");
                            } else {
                                _date = _tag_date.text();
                            }

                            var _tag_size = torrent_data_raw.find(".t_size");
                            var _tag_seeders = torrent_data_raw.find(".t_torrents");
                            var _tag_leechers = torrent_data_raw.find(".t_leech");
                            var _tag_completed = torrent_data_raw.find(".t_completed");

                            table_append({
                                "site": "HDChina",
                                "name": _tag_name.attr("title") || _tag_name.text(),
                                "link": "https://hdchina.org/" + _tag_name.attr("href"),
                                "pubdate": Date.parse(_date),
                                "size": FileSizetoLength(_tag_size.text()),
                                "seeders": _tag_seeders.text().replace(',', ''),
                                "leechers": _tag_leechers.text().replace(',', ''),
                                "completed": _tag_completed.text().replace(',', '')
                            });
                        }
                    }
                    writelog("End of Search Site HDChina.");
                }
            });
        }
        // TODO TTG
        // TODO HDCity
        // TODO CCFBits

        // 外网站点

        // BT站点

        // TODO DMHY
        // TODO RARGB
        // TODO Nyaa
        // TODO Nyaa(sukebei)

        // 自定义站点请添加到此处


    });
});