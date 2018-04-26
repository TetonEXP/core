const configManager = require('../managers/config')
const base58check = require('bs58check')
const bcrypto = require('../crypto')
const ECSignature = require('./ecsignature')
const randomBytes = require('randombytes')
const typeforce = require('typeforce')
const types = require('./types')
const wif = require('wif')

const BigInteger = require('bigi')

const ecurve = require('ecurve')
const secp256k1native = require('secp256k1')

const secp256k1 = ecurve.getCurveByName('secp256k1')

class ECPair {
  /**
   * @param {BigInteger} [d] Private key.
   * @param {Point} [Q] Public key.
   * @param {object} [options]
   * @param {boolean} [options.compressed=true]
   * @param {Network} [options.network=networks.mainnet]
   */
  constructor (d, Q, options) {
    if (options) {
      typeforce({
        compressed: types.maybe(types.Boolean),
        network: types.maybe(types.Network)
      }, options)
    }

    options = options || {}

    if (d) {
      if (d.signum() <= 0) throw new Error('Private key must be greater than 0')
      if (d.compareTo(secp256k1.n) >= 0) throw new Error('Private key must be less than the curve order')
      if (Q) throw new TypeError('Unexpected publicKey parameter')

      this.d = d
      this.Q = secp256k1.G.multiply(this.d)
    } else {
      typeforce(types.ECPoint, Q)

      this.Q = Q
    }

    /** @type {boolean} */
    this.compressed = options.compressed === undefined ? true : options.compressed
    /** @type {Network} */
    this.network = options.network || configManager.all()
  }

  /**
   * [fromPublicKeyBuffer description]
   * @param  {Buffer} buffer
   * @param  {(Object|Array)} network
   * @returns {ECPair}
   */
  static fromPublicKeyBuffer (buffer, network) {
    const Q = ecurve.Point.decodeFrom(secp256k1, buffer)

    return new ECPair(null, Q, {
      compressed: Q.compressed,
      network
    })
  }

  /**
   * [fromSeed description]
   * @param  {String} seed
   * @param  {Object} options
   * @returns {ECPair}
   */
  static fromSeed (seed, options) {
    const hash = bcrypto.sha256(Buffer.from(seed, 'utf-8'))
    const d = BigInteger.fromBuffer(hash)

    if (d.signum() <= 0 || d.compareTo(secp256k1.n) >= 0) {
      throw new Error('seed cannot resolve to a compatible private key')
    } else {
      return new ECPair(d, null, options)
    }
  }

  /**
   * [fromWIF description]
   * @param  {String} string
   * @param  {(Object|Array)} network
   * @returns {ECPair}
   */
  static fromWIF (string, network) {
    const decoded = wif.decode(string)
    const version = decoded.version

    // [network, ...]
    if (types.Array(network)) {
      network = network.filter(function (network) {
        return version === network.wif
      }).pop()

      if (!network) throw new Error('Unknown network version')

      // network
    } else {
      network = network || configManager.all()

      if (version !== network.wif) throw new Error('Invalid network version')
    }

    const d = BigInteger.fromBuffer(decoded.privateKey)

    return new ECPair(d, null, {
      compressed: decoded.compressed,
      network
    })
  }

  /**
   * [makeRandom description]
   * @param  {Object} options
   * @returns {ECPair}
   */
  static makeRandom (options) {
    options = options || {}

    const rng = options.rng || randomBytes

    let d
    do {
      const buffer = rng(32)
      typeforce(types.Buffer256bit, buffer)

      d = BigInteger.fromBuffer(buffer)
    } while (d.signum() <= 0 || d.compareTo(secp256k1.n) >= 0)

    return new ECPair(d, null, options)
  }

  /**
   * [getAddress description]
   * @returns {ECPair}
   */
  getAddress () {
    const payload = Buffer.alloc(21)
    const hash = bcrypto.ripemd160(this.getPublicKeyBuffer())
    const version = this.network.pubKeyHash
    payload.writeUInt8(version, 0)
    hash.copy(payload, 1)

    return base58check.encode(payload)
  }

  /**
   * [getNetwork description]
   * @returns {ECPair}
   */
  getNetwork () {
    return this.network
  }

  /**
   * [getPublicKeyBuffer description]
   * @returns {ECPair}
   */
  getPublicKeyBuffer () {
    return this.Q.getEncoded(this.compressed)
  }

  /**
   * [sign description]
   * @param  {Buffer} hash
   * @returns {ECPair}
   */
  sign (hash) {
    if (!this.d) throw new Error('Missing private key')

    const native = secp256k1native.sign(hash, this.d.toBuffer(32))
    return ECSignature.parseNativeSecp256k1(native).signature
  }

  /**
   * [toWIF description]
   * @returns {ECPair}
   */
  toWIF () {
    if (!this.d) throw new Error('Missing private key')

    return wif.encode(this.network.wif, this.d.toBuffer(32), this.compressed)
  }

  /**
   * [verify description]
   * @param  {Buffer} hash
   * @param  {ECPair} signature
   * @returns {ECPair}
   */
  verify (hash, signature) {
    return secp256k1native.verify(hash, signature.toNativeSecp256k1(), this.Q.getEncoded(this.compressed))
  }
}

module.exports = ECPair
