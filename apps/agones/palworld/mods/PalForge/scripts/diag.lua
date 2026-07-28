local M = {}

local HTTP_GLOBALS = { "http", "socket", "curl", "https", "ssl" }
local HTTP_MODULES = { "socket", "socket.http", "ssl", "ssl.https", "http", "http.request" }
local CURL_CANDIDATES = { "curl --version", "curl.exe --version" }

local function trim(s)
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function cmd_httptest(emit)
    emit("httptest: start (capability detection only; NO network, NO exec)")
    emit("httptest package -> " .. type(package))
    if type(package) == "table" then
        emit("httptest package.loadlib -> " .. type(package.loadlib))
        emit("httptest package.cpath -> " .. tostring(package.cpath))
    end
    emit("httptest os.execute -> " .. type(os.execute))
    emit("httptest io.popen -> " .. type(io.popen))
    for _, g in ipairs(HTTP_GLOBALS) do
        emit("httptest global " .. g .. " -> " .. type(_G[g]))
    end
    for _, name in ipairs(HTTP_MODULES) do
        local ok, mod = pcall(require, name)
        emit("httptest require " .. name .. " -> " .. (ok and type(mod) or "absent"))
    end
    emit("httptest: done (nothing loaded, nothing sent)")
end

local function cmd_curltest(emit)
    emit("curltest: start (runs 'curl --version' only; NO network)")
    local ok0 = pcall(function()
        local h = io.popen("echo palforge_popen_ok")
        if h then
            local out = h:read("*l")
            h:close()
            emit("curltest popen echo -> " .. tostring(out))
        else
            emit("curltest popen echo -> no handle")
        end
    end)
    if not ok0 then
        emit("curltest popen echo -> ERR (io.popen blocked)")
    end
    for _, cmd in ipairs(CURL_CANDIDATES) do
        local ok = pcall(function()
            local h = io.popen(cmd .. " 2>&1")
            if not h then
                emit("curltest " .. cmd .. " -> no handle")
                return
            end
            local out = h:read("*l")
            h:close()
            emit("curltest " .. cmd .. " -> " .. tostring(out))
        end)
        if not ok then
            emit("curltest " .. cmd .. " -> ERR")
        end
    end
    emit("curltest: done")
end

function M.handle(sender, text, emit)
    if type(text) ~= "string" then
        return false
    end
    local cmd = trim(text):lower()
    if cmd == "!httptest" then
        cmd_httptest(emit)
        return true
    end
    if cmd == "!curltest" then
        cmd_curltest(emit)
        return true
    end
    return false
end

return M
