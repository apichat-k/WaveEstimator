# FPV Wave Estimator

เว็บแอปคำนวณ **Fetch Length**, **Significant Wave Height (Hs)** และ **Maximum Wave Height (Hmax)** จากลม
สำหรับพื้นที่ติดตั้ง Floating Solar (FPV) ของ 5 อ่างเก็บน้ำ EGAT ตามวิธี USBR DS-13 (Ch.6 Freeboard, Sept 2012, App. B)

| รหัส | อ่างเก็บน้ำ |
|---|---|
| BB-PV | ภูมิพล |
| SNR-PV1 | ศรีนครินทร์ |
| VRK-PV1 | วชิราลงกรณ |
| UR-PV | อุบลรัตน์ |
| SRD-PV | สิรินธร |

## ใช้งาน
เปิด `FPV_Wave_Estimator.html` (หรือ `docs/index.html`) ในเบราว์เซอร์ได้เลย ไม่ต้องติดตั้งอะไร
ภาพดาวเทียม ปุ่ม Capture และการพิมพ์/ดาวน์โหลดรายงานทำงานเมื่อเปิดไฟล์นี้ในเบราว์เซอร์โดยตรง

## Build ใหม่จากซอร์ส
```
cd src
python3 build.py   # สร้าง FPV_Wave_Estimator.html (และ .artifact.html) ใน src/
```
- `app.head.html` – หน้าเว็บ/CSS · `core.js` – คำนวณ (UTM, ray casting, DS-13) · `app2.js` – UI/แผนที่/ตรวจแนวขอบ/รายงาน
- `shore.json` – แนวขอบอ่างจาก Hydro_aw.kmz · `projects.json` – Project Boundary / PV Array จาก KMZ

## หมายเหตุด้านข้อมูล
พื้นที่ผิวน้ำจากไฟล์ขอบอ่างเทียบกับค่าที่เผยแพร่: BB +1.6%, SNR −14.9%, VRK −5.4%, UR −1.5%, SRD −7.6%
(ศรีนครินทร์ควรใช้เส้นขอบที่ระดับน้ำออกแบบ) · ค่าลมตั้งต้นของ VRK/UR (140 km/h) ยังไม่มีแหล่งอ้างอิง ควรยืนยัน
ผลลัพธ์เป็นการประมาณเบื้องต้น ต้องผ่านการทบทวนโดยวิศวกรก่อนใช้ออกแบบ
