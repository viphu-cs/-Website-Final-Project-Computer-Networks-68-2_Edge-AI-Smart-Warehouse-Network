// --- ส่วนจำลองระบบเครือข่าย ---
const TARGET_TEMP = 25.0;
let isNetworkUp = true;
let dtnBuffer = [];
let currentSessionId = generateSessionId();
const MAX_LOGS = 50; // จำกัดจำนวน Log เพื่อป้องกัน Memory Leak

// UI Elements
const elEdgeTemp = document.getElementById('edge-temp');
const elEdgeState = document.getElementById('edge-state');
const elEdgeNetwork = document.getElementById('edge-network');
const elEdgeBuffer = document.getElementById('edge-buffer');
const elEdgeLog = document.getElementById('edge-log');
const elCloudLog = document.getElementById('cloud-log');
const elCloudLatest = document.getElementById('cloud-latest-data');

function generateSessionId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function addLog(container, msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.innerHTML = msg;
    container.appendChild(div);

    // Memory Management: ลบ Log เก่าออกถ้าเกินจำนวนที่กำหนด
    if (container.children.length > MAX_LOGS) {
        container.removeChild(container.firstChild);
    }

    container.scrollTop = container.scrollHeight;
}

function logEdge(msg, type = 'info') {
    addLog(elEdgeLog, msg, type);
}

function logCloud(msg, type = 'info') {
    addLog(elCloudLog, msg, type);
}

// --- DAFT Core Logic (จำลอง Layer 7) ---
function classifyDaft(temp) {
    let xi = -(temp / TARGET_TEMP);
    let xj = 1.0;
    let o4 = Math.abs(xi) - Math.abs(xj);
    let o6 = Math.abs(xi - xj);

    let state = "DESTRUCTIVE";
    if (Math.abs(o4) < 1e-8 * o6) {
        state = "PURE";
    } else if (o4 < 0) {
        state = "CONSTRUCTIVE";
    }
    return { xi, xj, o4, o6, state };
}

// --- Cloud Receiver (จำลอง Layer 3->7 ฝั่งรับ) ---
function cloudReceivePacket(packet) {
    // ถอดซอง IP (L3), ถอด Session (L5)
    let sessionId = packet.session_id;

    // ถอดรหัส Base64 (L6 Presentation)
    try {
        let decodedStr = atob(packet.data);
        let payload = JSON.parse(decodedStr);

        logCloud(`[L3 Network] 📥 ได้รับ UDP Datagram จาก 192.168.1.50`, 'info');
        logCloud(`[L5 Session] 🔑 Session ID: ${sessionId}`, 'info');
        logCloud(`[L6 Presentation] 🔓 ถอดรหัส Base64 สำเร็จ`, 'success');
        logCloud(`[L7 Application] 📊 สถานะ: ${payload.state} | Temp: ${payload.temp}°C`, 'success');

        elCloudLatest.innerHTML = `
            <span style="color:#0f0">Temp:</span> ${payload.temp}°C | 
            <span style="color:#0f0">State:</span> ${payload.state} | 
            <span style="color:#0f0">Action:</span> ${payload.action}
        `;
    } catch (e) {
        logCloud(`[Error] ไม่สามารถถอดรหัสแพ็กเก็ตได้`, 'error');
    }
}

// --- Edge Node Main Loop ---
function simulateEdgeTick() {
    // 1. จำลองการอ่านค่าเซนเซอร์
    let temp = (Math.random() * (38.0 - 20.0) + 20.0).toFixed(1);
    elEdgeTemp.innerText = `${temp} °C`;

    // 2. Layer 7: DAFT Filter
    let daft = classifyDaft(temp);
    elEdgeState.innerText = `${daft.state}`;

    let action = daft.state === "DESTRUCTIVE" ? "เปิดพัดลมระบายอากาศ 🚨" : "ปิดพัดลม ❄️";

    let payload = {
        temp: temp,
        state: daft.state,
        O4_asymmetry: daft.o4.toFixed(4),
        action: action
    };
    logEdge(`<span class="layer-tag">[L7 App]</span> DAFT State: ${daft.state} (O4=${daft.o4.toFixed(2)})`);

    // 3. Layer 6: Presentation (แปลง JSON + เข้ารหัส Base64)
    let jsonStr = JSON.stringify(payload);
    let encodedData = btoa(jsonStr); // Base64 Encode
    logEdge(`<span class="layer-tag">[L6 Pres]</span> เข้ารหัส Base64: ${encodedData.substring(0, 20)}...`);

    // 4. Layer 1/2: จำลองสถานะเครือข่าย (โอกาสหลุด 30%)
    let wasUp = isNetworkUp;
    isNetworkUp = Math.random() > 0.3;

    if (isNetworkUp) {
        elEdgeNetwork.className = "badge up";
        elEdgeNetwork.innerText = "UP";

        // Layer 5: จัดการ Session
        if (!wasUp) {
            currentSessionId = generateSessionId();
            logEdge(`<span class="layer-tag">[L5 Session]</span> สร้าง Session ใหม่: ${currentSessionId}`, 'success');
        }

        // Layer 4: DTN Recovery (Sync ข้อมูลค้าง)
        if (dtnBuffer.length > 0) {
            logEdge(`<span class="layer-tag">[L4 Transport]</span> 🔄 เน็ตมาแล้ว! ทยอยส่งข้อมูล DTN Buffer (${dtnBuffer.length} packets)`, 'success');
            while (dtnBuffer.length > 0) {
                let bufferedData = dtnBuffer.shift();
                let packet = { src_ip: "192.168.1.50", dst_ip: "127.0.0.1", session_id: currentSessionId, data: bufferedData };
                cloudReceivePacket(packet);
            }
            elEdgeBuffer.innerText = `0 Packets`;
        }

        // Layer 3: Network (สร้างซอง IP แล้วส่ง)
        let currentPacket = {
            src_ip: "192.168.1.50",
            dst_ip: "127.0.0.1",
            session_id: currentSessionId,
            data: encodedData
        };
        logEdge(`<span class="layer-tag">[L3 Net]</span> 🚀 ส่ง UDP Packet ไปยัง Cloud สำเร็จ`, 'info');
        cloudReceivePacket(currentPacket);

    } else {
        // กรณีเน็ตหลุด
        elEdgeNetwork.className = "badge down";
        elEdgeNetwork.innerText = "DOWN";

        logEdge(`<span class="layer-tag">[L1/L2 Link]</span> ❌ สายสัญญาณขาด! (Link Failure)`, 'error');

        // Layer 5: ทำลาย Session
        logEdge(`<span class="layer-tag">[L5 Session]</span> ทำลาย Session ID: ${currentSessionId}`, 'warn');

        // Layer 4: DTN Buffer (เก็บลง Local Storage/Array)
        dtnBuffer.push(encodedData);
        elEdgeBuffer.innerText = `${dtnBuffer.length} Packets`;
        logEdge(`<span class="layer-tag">[L4 Transport]</span> 📦 นำข้อมูลพักลง DTN Buffer (ป้องกัน Packet Loss)`, 'warn');
    }

    logEdge(`-------------------------------------------------`);
}

// เริ่มต้นการจำลอง ทำงานทุกๆ 4 วินาที
logEdge(`[System] เริ่มการจำลอง Edge AI Node...`);
logCloud(`[System] Cloud Server รอรับข้อมูลที่ Port 9999...`);
setInterval(simulateEdgeTick, 4000);
simulateEdgeTick(); // รันรอบแรกทันที
