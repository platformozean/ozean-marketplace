// جسر Firebase: تسجيل الدخول بحساب Google والقراءة والنشر والحفظ
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, getDocs, collection, query, where, addDoc, deleteDoc, serverTimestamp, runTransaction, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// الصق إعدادات مشروعك من: Project settings ← Your apps ← Web app
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

window.ozean = { user: null };

window.signIn = async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { alert("تعذّر تسجيل الدخول: " + e.message); }
};
window.signOutUser = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  window.ozean.user = user;
  window.dispatchEvent(new CustomEvent("ozean-auth", { detail: user }));
  if (user) {
    const r = doc(db, "users", user.uid);
    const snap = await getDoc(r);
    if (!snap.exists()) {
      const ok = confirm("بالمتابعة توافق على حفظ بياناتك (الاسم والبريد والصورة) لإدارة حسابك في Ozean. هل توافق؟");
      if (!ok) { await signOut(auth); return; }
      await setDoc(r, { displayName: user.displayName || "", email: user.email || "",
        photoURL: user.photoURL || "", phone: "", createdAt: serverTimestamp(),
        consentAt: serverTimestamp(), lastLoginAt: serverTimestamp() });
    } else {
      await updateDoc(r, { lastLoginAt: serverTimestamp(), displayName: user.displayName || "",
        photoURL: user.photoURL || "" });
    }
  }
});

function mapItem(d) {
  const x = d.data();
  return { id: x.numId, _docId: d.id, title: x.title, desc: x.description, cat: x.category,
           price: x.pricingMode === "free" ? 0 : (x.pricingMode === "nego" ? null : x.price),
           cur: x.currency, artist: x.artist, img: x.previewData || x.previewUrl || null,
           gallery: x.gallery || (x.previewData ? [x.previewData] : []),
           ownerUid: x.artistId,
           artistRole: x.artistRole || "", artistRoleOther: x.artistRoleOther || "",
           driveLink: (x.artistId === window.ozean.user?.uid ? x.driveLink : null) || null,
           auction: x.auction ? { ...x.auction, endsAt: x.auction.endsAt && x.auction.endsAt.toMillis ? x.auction.endsAt.toMillis() : 0 } : null,
           dur: x.duration || "", mine: x.artistId === window.ozean.user?.uid,
           draft: !x.isPublished };
}

// يحدّث نوع الفنان في كل أعماله المنشورة سابقاً ليظهر للزوار
window.syncItemsRole = async (role, other) => {
  const u = window.ozean.user; if (!u) return;
  const snap = await getDocs(query(collection(db, "items"), where("artistId", "==", u.uid)));
  await Promise.all(snap.docs
    .filter(d => (d.data().artistRole || null) !== role || (d.data().artistRoleOther || null) !== other)
    .map(d => updateDoc(doc(db, "items", d.id), { artistRole: role, artistRoleOther: other })));
};

window.loadItems = async () => {
  const out = [];
  const pub = await getDocs(query(collection(db, "items"), where("isPublished", "==", true)));
  pub.forEach(d => out.push(mapItem(d)));
  if (window.ozean.user) {
    const mine = await getDocs(query(collection(db, "items"), where("artistId", "==", window.ozean.user.uid)));
    mine.forEach(d => { if (!out.find(x => x._docId === d.id)) out.push(mapItem(d)); });
  }
  // رابط الملف الأصلي محفوظ في وثيقة خاصة، ويُحمَّل لصاحب العمل فقط
  await Promise.all(out.filter(x => x.mine && x._docId).map(async x => {
    try {
      const s = await getDoc(doc(db, "items", x._docId, "private", "master"));
      if (s.exists() && s.data().driveLink) x.driveLink = s.data().driveLink;
    } catch (e) {}
  }));
  return out;
};

// ضغط المعاينة لتبقى صغيرة داخل وثيقة Firestore (الحد الأقصى للوثيقة 1 ميغابايت)
async function compressImage(src, maxW = 800, maxBytes = 300 * 1024) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  for (let q = 0.8; q >= 0.4; q -= 0.1) {
    const out = c.toDataURL("image/jpeg", q);
    if (out.length * 0.75 <= maxBytes) return out;
  }
  throw new Error("الصورة كبيرة جداً بعد الضغط، اختر صورة أصغر");
}

window.publishItem = async (item) => {
  const user = window.ozean.user;
  if (!user) throw new Error("سجّل الدخول أولاً");
  if (item.vid || item.aud) throw new Error("رفع الفيديو والموسيقى يتطلب تفعيل التخزين (Storage) أولاً");
  const uid = user.uid;
  if (item.driveLink && !/^https:\/\/(drive|docs)\.google\.com\//.test(item.driveLink)) {
    throw new Error("رابط Google Drive غير صالح، يجب أن يبدأ بـ https://drive.google.com/");
  }
  const galleryData = item.gallery && item.gallery.length
    ? await Promise.all(item.gallery.map(g => compressImage(g, 700, 150 * 1024)))
    : (item.img ? [await compressImage(item.img, 700, 150 * 1024)] : []);
  const previewData = galleryData[0] || null;
  const docRef = await addDoc(collection(db, "items"), {
    numId: item.id, title: item.title, description: item.desc || "",
    category: item.cat,
    pricingMode: item.auction ? "auction" : (item.price === 0 ? "free" : (item.price == null ? "nego" : "fixed")),
    price: item.auction ? Number(item.auction.startPrice) : (item.price ?? null), currency: item.cur || "LYD",
    artist: user.displayName || "فنان", artistId: uid,
    artistRole: item.artistRole || null, artistRoleOther: item.artistRoleOther || null,
    isPublished: !item.draft, createdAt: serverTimestamp(),
    commissionPercent: item.commissionPercent ?? 10, minFeeUsd: item.minFeeUsd ?? 0.5,
    previewData,
    gallery: galleryData,
    auction: item.auction ? { ...item.auction, startPrice: Number(item.auction.startPrice), minStep: Number(item.auction.minStep), endsAt: Timestamp.fromDate(new Date(item.auction.endsAt)) } : null
  });
  const warnings = [];
  // الملف الأصلي وروابطه تُحفظ في وثيقة خاصة لا يقرؤها إلا صاحب العمل أو مشترٍ أكّد الفنان دفعه
  const masterRef = doc(db, "items", docRef.id, "private", "master");
  if (item.driveLink) await setDoc(masterRef, { driveLink: item.driveLink });
  if (item.masterFile && !item.driveLink) {
    try {
      const path = `masters/${uid}/${docRef.id}/${item.masterFile.name}`;
      await uploadBytes(ref(storage, path), item.masterFile);
      await setDoc(masterRef, { masterPath: path });
    } catch (e) {
      console.error(e);
      warnings.push("الملف الأصلي لم يُحفظ، تحقق من تفعيل التخزين (Storage)");
    }
  }
  return { id: docRef.id, warnings };
};

const PAY_KEYS = ["pw_type","pw_num","pb_bank","pb_acc","pb_name","pi_name","pi_iban","pi_swift","pi_wise","pu_name"];
const cleanPay = (p) => { const o = {}; PAY_KEYS.forEach(k => { if (p && typeof p[k] === "string" && p[k].trim()) o[k] = p[k].trim().slice(0, 120); }); return o; };

window.loadProfile = async () => {
  const u = window.ozean.user; if (!u) return null;
  const s = await getDoc(doc(db, "users", u.uid));
  const out = s.exists() ? s.data() : null;
  try {
    const p = await getDoc(doc(db, "payInfo", u.uid));
    if (out && p.exists()) { const { updatedAt, ...pay } = p.data(); out.payments = pay; }
  } catch (e) {}
  return out;
};
window.saveProfile = async (data) => {
  const u = window.ozean.user; if (!u) throw new Error("سجّل الدخول أولاً");
  const { payments, ...rest } = data || {};
  const clean = {};
  Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
  if (Object.keys(clean).length) await updateDoc(doc(db, "users", u.uid), clean);
  if (payments) await setDoc(doc(db, "payInfo", u.uid), { ...cleanPay(payments), updatedAt: serverTimestamp() });
};
// بيانات استلام الفنان: تُعرض للمشتري المسجّل فقط عند الدفع
window.loadSellerPay = async (uid) => {
  if (!window.ozean.user || !uid) return null;
  try { const s = await getDoc(doc(db, "payInfo", uid)); if (!s.exists()) return null; const { updatedAt, ...pay } = s.data(); return pay; }
  catch (e) { return null; }
};

window.placeBid = async (docId, amount) => {
  const u = window.ozean.user;
  if (!u) throw new Error("سجّل الدخول أولاً");
  const ref = doc(db, "items", docId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("العمل غير موجود");
    const a = snap.data().auction;
    if (!a) throw new Error("هذا العمل ليس مزاداً");
    const ends = a.endsAt && a.endsAt.toMillis ? a.endsAt.toMillis() : 0;
    if (a.closed || Date.now() >= ends) throw new Error("انتهى المزاد");
    const min = a.highBid != null ? a.highBid + a.minStep : a.startPrice;
    if (!(Number(amount) >= min)) throw new Error("أقل مزايدة مسموحة: " + min);
    tx.update(ref, {
      "auction.highBid": Number(amount),
      "auction.highBidder": u.uid,
      "auction.highBidderName": u.displayName || "",
      "auction.bids": (a.bids || 0) + 1
    });
  });
};

window.closeAuction = async (docId) => {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  await updateDoc(doc(db, "items", docId), { "auction.closed": true });
};

async function removeItemFully(docId) {
  const mref = doc(db, "items", docId, "private", "master");
  try {
    const m = await getDoc(mref);
    if (m.exists() && m.data().masterPath) await deleteObject(ref(storage, m.data().masterPath)).catch(() => {});
    await deleteDoc(mref).catch(() => {});
  } catch (e) {}
  await deleteDoc(doc(db, "items", docId));
}
window.deleteItem = async (docId) => {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  await removeItemFully(docId);
};

window.deleteAccount = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("سجّل الدخول أولاً");
  const mine = await getDocs(query(collection(db, "items"), where("artistId", "==", user.uid)));
  for (const d of mine.docs) await removeItemFully(d.id);
  await deleteDoc(doc(db, "payInfo", user.uid)).catch(() => {});
  await deleteDoc(doc(db, "users", user.uid)).catch(() => {});
  await deleteUser(user);
};

// ===== الطلبات: شراء بالتحويل (داخل ليبيا وخارجها) =====
// الخطوات: المشتري ينشئ طلباً "pending" ← يحوّل المبلغ ويرسل الإيصال للفنان ← الفنان يؤكد ← يُفتح تنزيل الملف الأصلي
const mapOrder = (d) => {
  const x = d.data();
  const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
  return { id: d.id, ...x, createdAt: ms(x.createdAt), confirmedAt: ms(x.confirmedAt) };
};

window.createOrder = async (o) => {
  const u = window.ozean.user; if (!u) throw new Error("سجّل الدخول أولاً");
  if (!o || !o.docId) throw new Error("هذا العمل غير متاح للشراء المباشر");
  const is = await getDoc(doc(db, "items", o.docId));
  if (!is.exists() || !is.data().isPublished) throw new Error("العمل غير متاح");
  const it = is.data();
  if (it.artistId === u.uid) throw new Error("لا يمكنك شراء عملك");
  if (it.pricingMode !== "fixed") throw new Error("هذا العمل غير معروض للشراء المباشر");
  const oref = doc(db, "orders", o.docId + "_" + u.uid);
  const ex = await getDoc(oref);
  if (ex.exists()) {
    const st = ex.data().status;
    if (st === "confirmed") throw new Error("اشتريت هذا العمل مسبقاً");
    if (st === "pending") return { id: oref.id, ref: ex.data().ref, existing: true };
    await deleteDoc(oref); // طلب مرفوض سابقاً: يُعاد إنشاؤه
  }
  const data = {
    itemId: o.docId, itemNumId: it.numId ?? null, itemTitle: it.title,
    sellerId: it.artistId, buyerId: u.uid, buyerName: u.displayName || "", buyerEmail: u.email || "",
    ref: String(o.ref || "").slice(0, 40), method: String(o.method || "").slice(0, 60),
    region: o.region === "ly" ? "ly" : "int",
    amount: it.price, currency: it.currency || "LYD",   // السعر يؤخذ من الخادم لا من المتصفح
    status: "pending", createdAt: serverTimestamp()
  };
  await setDoc(oref, data);
  return { id: oref.id, ref: data.ref };
};

window.loadOrders = async () => {
  const u = window.ozean.user; if (!u) return { bought: [], sold: [] };
  const [b, s] = await Promise.all([
    getDocs(query(collection(db, "orders"), where("buyerId", "==", u.uid))),
    getDocs(query(collection(db, "orders"), where("sellerId", "==", u.uid)))
  ]);
  const byDate = (a, c) => c.createdAt - a.createdAt;
  return { bought: b.docs.map(mapOrder).sort(byDate), sold: s.docs.map(mapOrder).sort(byDate) };
};

async function setOrderStatus(id, status) {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  await updateDoc(doc(db, "orders", id), { status, confirmedAt: serverTimestamp() });
}
window.confirmOrder = (id) => setOrderStatus(id, "confirmed");
window.rejectOrder = (id) => setOrderStatus(id, "rejected");

// تسليم العمل الأصلي: لصاحب العمل أو لمشترٍ أكّد الفنان طلبه (تتحقق القواعد من ذلك)
window.getDelivery = async (docId) => {
  if (!window.ozean.user) throw new Error("سجّل الدخول أولاً");
  const s = await getDoc(doc(db, "items", docId, "private", "master"));
  if (!s.exists()) throw new Error("لم يرفع الفنان الملف الأصلي بعد");
  const d = s.data();
  const url = d.masterPath ? await getDownloadURL(ref(storage, d.masterPath)) : null;
  return { url, driveLink: d.driveLink || null };
};

window.saveAvatar = async (dataUrl) => {
  const user = window.ozean.user;
  if (!user) throw new Error("سجّل الدخول أولاً");
  const blob = await (await fetch(dataUrl)).blob();
  const r = ref(storage, `previews/${user.uid}/avatar`);
  await uploadBytes(r, blob);
  const url = await getDownloadURL(r);
  await updateDoc(doc(db, "users", user.uid), { photoURL: url });
  return url;
};
